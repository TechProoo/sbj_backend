import { Injectable, NotFoundException } from '@nestjs/common';
import { Testimonial } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';

const TTL_MS = 60_000;

export interface TestimonialFeed {
  items: Testimonial[];
  /// Averaged across published reviews, to one decimal. Null when there are
  /// none — the storefront then hides the summary rather than printing "0.0".
  average: number | null;
  count: number;
}

@Injectable()
export class TestimonialsService {
  private cache: { at: number; data: TestimonialFeed } | null = null;
  private inFlight: Promise<TestimonialFeed> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getFeed(): Promise<TestimonialFeed> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) {
      return this.cache.data;
    }

    this.inFlight ??= this.loadFeed()
      .then((data) => {
        this.cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private async loadFeed(): Promise<TestimonialFeed> {
    const items = await this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });

    if (items.length === 0) return { items, average: null, count: 0 };

    const total = items.reduce((sum, item) => sum + item.rating, 0);
    return {
      items,
      average: Math.round((total / items.length) * 10) / 10,
      count: items.length,
    };
  }

  private invalidate(): void {
    this.cache = null;
  }

  listAll(): Promise<Testimonial[]> {
    return this.prisma.testimonial.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateTestimonialDto): Promise<Testimonial> {
    const created = await this.prisma.testimonial.create({ data: dto });
    this.invalidate();
    return created;
  }

  async update(id: string, dto: UpdateTestimonialDto): Promise<Testimonial> {
    await this.getOrThrow(id);
    const updated = await this.prisma.testimonial.update({
      where: { id },
      data: dto,
    });
    this.invalidate();
    return updated;
  }

  async remove(id: string): Promise<Testimonial> {
    await this.getOrThrow(id);
    const removed = await this.prisma.testimonial.delete({ where: { id } });
    this.invalidate();
    return removed;
  }

  private async getOrThrow(id: string): Promise<Testimonial> {
    const found = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Testimonial not found');
    return found;
  }
}
