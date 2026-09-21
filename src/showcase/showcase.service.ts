import { Injectable, NotFoundException } from '@nestjs/common';
import { Showcase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShowcaseDto, UpdateShowcaseDto } from './dto/showcase.dto';

const TTL_MS = 60_000;

@Injectable()
export class ShowcaseService {
  private cache: { at: number; data: Showcase[] } | null = null;
  private inFlight: Promise<Showcase[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getPublished(): Promise<Showcase[]> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) {
      return this.cache.data;
    }

    this.inFlight ??= this.prisma.showcase
      .findMany({
        where: { isPublished: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      })
      .then((data) => {
        this.cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private invalidate(): void {
    this.cache = null;
  }

  listAll(): Promise<Showcase[]> {
    return this.prisma.showcase.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateShowcaseDto): Promise<Showcase> {
    const created = await this.prisma.showcase.create({
      data: {
        ...dto,
        happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : null,
      },
    });
    this.invalidate();
    return created;
  }

  async update(id: string, dto: UpdateShowcaseDto): Promise<Showcase> {
    await this.getOrThrow(id);
    const { happenedAt, ...rest } = dto;
    const updated = await this.prisma.showcase.update({
      where: { id },
      data: {
        ...rest,
        ...(happenedAt !== undefined
          ? { happenedAt: new Date(happenedAt) }
          : {}),
      },
    });
    this.invalidate();
    return updated;
  }

  async remove(id: string): Promise<Showcase> {
    await this.getOrThrow(id);
    const removed = await this.prisma.showcase.delete({ where: { id } });
    this.invalidate();
    return removed;
  }

  private async getOrThrow(id: string): Promise<Showcase> {
    const found = await this.prisma.showcase.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Showcase entry not found');
    return found;
  }
}
