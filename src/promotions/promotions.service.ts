import { Injectable, NotFoundException } from '@nestjs/common';
import { Promotion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';

/// Short by design. Unlike the menu, a promotion can expire at a wall-clock
/// moment nobody triggers, so the cache must not outlive the window by much.
const LIVE_TTL_MS = 30_000;

@Injectable()
export class PromotionsService {
  private cache: { at: number; data: Promotion[] } | null = null;
  private inFlight: Promise<Promotion[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /// What the storefront carousel shows: active, and inside its date window.
  async getLive(): Promise<Promotion[]> {
    if (this.cache && Date.now() - this.cache.at < LIVE_TTL_MS) {
      return this.cache.data;
    }

    this.inFlight ??= this.loadLive()
      .then((data) => {
        this.cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private loadLive(): Promise<Promotion[]> {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        isActive: true,
        // A null bound means "open ended" on that side.
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }

  private invalidate(): void {
    this.cache = null;
  }

  /// Staff view: everything, including expired and switched-off slides.
  listAll(): Promise<Promotion[]> {
    return this.prisma.promotion.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreatePromotionDto): Promise<Promotion> {
    const created = await this.prisma.promotion.create({
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    this.invalidate();
    return created;
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<Promotion> {
    await this.getOrThrow(id);

    const { startsAt, endsAt, ...rest } = dto;
    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        ...rest,
        ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
        ...(endsAt !== undefined ? { endsAt: new Date(endsAt) } : {}),
      },
    });
    this.invalidate();
    return updated;
  }

  async remove(id: string): Promise<Promotion> {
    await this.getOrThrow(id);
    const removed = await this.prisma.promotion.delete({ where: { id } });
    this.invalidate();
    return removed;
  }

  private async getOrThrow(id: string): Promise<Promotion> {
    const promotion = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promotion) throw new NotFoundException('Promotion not found');
    return promotion;
  }
}
