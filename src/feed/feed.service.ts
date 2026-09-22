import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeedKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

/// Images only, for now. Anything else is rejected before it reaches storage.
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

/// Phone cameras produce large files; six megabytes is a generous ceiling for
/// something that will be looked at on a phone.
const MAX_BYTES = 6 * 1024 * 1024;

const postSelect = {
  id: true,
  kind: true,
  caption: true,
  imageUrl: true,
  isPublished: true,
  createdAt: true,
  author: { select: { fullName: true } },
} satisfies Prisma.FeedPostSelect;

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  private get bucket(): string {
    return this.config.get<string>('supabase.feedBucket') ?? 'feed';
  }

  /// What customers see: published posts, newest first.
  async list(limit = 30) {
    const posts = await this.prisma.feedPost.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 60),
      select: postSelect,
    });

    return posts.map((post) => ({
      ...post,
      author: post.author?.fullName ?? null,
    }));
  }

  /// What the kitchen sees: everything, including what it has unpublished.
  async listAll() {
    const posts = await this.prisma.feedPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: postSelect,
    });

    return posts.map((post) => ({
      ...post,
      author: post.author?.fullName ?? null,
    }));
  }

  /*
   * Creating a post is an upload followed by a row.
   *
   * If the row fails the uploaded image is removed again, so a failed post
   * cannot leave a file behind that nothing points at.
   */
  async create(
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    caption: string,
    kind: FeedKind,
    authorId: string | null,
  ) {
    if (!file) throw new BadRequestException('Attach an image');

    const extension = ALLOWED.get(file.mimetype);
    if (!extension) {
      throw new BadRequestException(
        'Images only — JPEG, PNG, WebP or AVIF',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('That image is larger than 6MB');
    }

    const trimmed = caption.trim();
    if (!trimmed) throw new BadRequestException('Say something about the picture');

    // Dated prefix so the bucket stays browsable a year from now.
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomUUID()}.${extension}`;

    const uploaded = await this.supabase.uploadPublic(
      this.bucket,
      path,
      file.buffer,
      file.mimetype,
    );

    try {
      const post = await this.prisma.feedPost.create({
        data: {
          kind,
          caption: trimmed,
          imageUrl: uploaded.url,
          imagePath: uploaded.path,
          authorId,
        },
        select: postSelect,
      });

      this.logger.log(`Feed post ${post.id} (${kind})`);
      return { ...post, author: post.author?.fullName ?? null };
    } catch (error) {
      await this.supabase.removeObject(this.bucket, uploaded.path);
      throw error;
    }
  }

  async setPublished(id: string, isPublished: boolean) {
    const post = await this.prisma.feedPost
      .update({ where: { id }, data: { isPublished }, select: postSelect })
      .catch(() => null);

    if (!post) throw new NotFoundException('Post not found');
    return { ...post, author: post.author?.fullName ?? null };
  }

  /// Removes the row and the image behind it.
  async remove(id: string) {
    const post = await this.prisma.feedPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.feedPost.delete({ where: { id } });
    await this.supabase.removeObject(this.bucket, post.imagePath);

    return { id };
  }
}
