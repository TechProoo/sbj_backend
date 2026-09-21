import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uniqueSlug } from '../common/utils/slug';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  MenuQueryDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

const itemInclude = {
  category: { select: { id: true, name: true, slug: true } },
  modifierGroups: {
    orderBy: { position: 'asc' },
    include: {
      group: {
        include: {
          modifiers: {
            where: { isAvailable: true },
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  },
} satisfies Prisma.MenuItemInclude;

type Storefront = Awaited<ReturnType<MenuService['loadStorefrontMenu']>>;

/// How long the storefront menu may be served from memory.
///
/// The database is remote — a single round trip costs most of a second — and
/// the nested menu query makes several. The menu itself changes a few times a
/// day at most, so caching it is the difference between a 3s first paint and
/// an instant one. Every write path calls `invalidate()`, so an item the
/// kitchen 86s disappears on the next request rather than after the TTL.
const MENU_TTL_MS = 60_000;

@Injectable()
export class MenuService {
  private cache: { at: number; data: Storefront } | null = null;
  /// Held so a burst of cold requests triggers one query, not one each.
  private inFlight: Promise<Storefront> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getStorefrontMenu(): Promise<Storefront> {
    if (this.cache && Date.now() - this.cache.at < MENU_TTL_MS) {
      return this.cache.data;
    }

    this.inFlight ??= this.loadStorefrontMenu()
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

  /// The whole storefront menu — categories with their available items nested,
  /// which is exactly how the ordering page renders it.
  private async loadStorefrontMenu() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, items: { some: { isAvailable: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          include: { modifierGroups: itemInclude.modifierGroups },
        },
      },
    });

    return categories.map((category) => ({
      ...category,
      items: category.items.map(flattenModifierGroups),
    }));
  }

  listCategories(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const slug = await uniqueSlug(dto.name, async (candidate) =>
      Boolean(
        await this.prisma.category.findUnique({ where: { slug: candidate } }),
      ),
    );
    const created = await this.prisma.category.create({
      data: { ...dto, slug },
    });
    this.invalidate();
    return created;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.getCategoryOrThrow(id);
    const updated = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    this.invalidate();
    return updated;
  }

  async listItems(query: MenuQueryDto) {
    const where: Prisma.MenuItemWhereInput = {};

    if (!query.includeUnavailable) where.isAvailable = true;
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.category) {
      where.category = { OR: [{ slug: query.category }, { id: query.category }] };
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { tags: { has: query.search.toLowerCase() } },
      ];
    }

    const items = await this.prisma.menuItem.findMany({
      where,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      take: query.take ?? 100,
      include: itemInclude,
    });

    return items.map(flattenModifierGroups);
  }

  async getItemBySlug(slug: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { slug },
      include: itemInclude,
    });
    if (!item) throw new NotFoundException(`No menu item "${slug}"`);
    return flattenModifierGroups(item);
  }

  async createItem(dto: CreateMenuItemDto) {
    await this.getCategoryOrThrow(dto.categoryId);
    const slug = await uniqueSlug(dto.name, async (candidate) =>
      Boolean(
        await this.prisma.menuItem.findUnique({ where: { slug: candidate } }),
      ),
    );

    const created = await this.prisma.menuItem.create({
      data: {
        ...dto,
        slug,
        price: new Prisma.Decimal(dto.price),
        tags: dto.tags?.map((tag) => tag.toLowerCase()) ?? [],
      },
      include: itemInclude,
    });
    this.invalidate();
    return created;
  }

  async updateItem(id: string, dto: UpdateMenuItemDto) {
    await this.getItemOrThrow(id);
    if (dto.categoryId) await this.getCategoryOrThrow(dto.categoryId);

    const { price, tags, ...rest } = dto;
    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: {
        ...rest,
        ...(price !== undefined ? { price: new Prisma.Decimal(price) } : {}),
        ...(tags ? { tags: tags.map((tag) => tag.toLowerCase()) } : {}),
      },
      include: itemInclude,
    });
    this.invalidate();
    return updated;
  }

  /// "86-ing" an item — the kitchen ran out, hide it from the storefront now.
  async setAvailability(id: string, isAvailable: boolean) {
    await this.getItemOrThrow(id);
    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable },
      include: itemInclude,
    });
    this.invalidate();
    return updated;
  }

  async deleteItem(id: string) {
    await this.getItemOrThrow(id);
    const orderCount = await this.prisma.orderItem.count({
      where: { menuItemId: id },
    });

    // Past orders reference this row; deleting it would rewrite history, so an
    // item that has ever sold is retired rather than removed.
    const result =
      orderCount > 0
        ? await this.prisma.menuItem.update({
            where: { id },
            data: { isAvailable: false, isFeatured: false },
          })
        : await this.prisma.menuItem.delete({ where: { id } });

    this.invalidate();
    return result;
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async getItemOrThrow(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }
}

/// Collapses the join table so clients see `modifierGroups: [{...group}]`
/// instead of `[{ group: {...} }]`.
function flattenModifierGroups<
  T extends { modifierGroups: { group: unknown }[] },
>(item: T) {
  return {
    ...item,
    modifierGroups: item.modifierGroups.map((link) => link.group),
  };
}
