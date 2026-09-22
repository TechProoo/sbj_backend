import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

interface SeedItem {
  name: string;
  description: string;
  price: number;
  prepMinutes: number;
  spiceLevel?: number;
  tags?: string[];
  isFeatured?: boolean;
  /// Served straight from frontend/public — keep the filename in sync there.
  imageUrl?: string;
}

/*
 * Menu and pricing taken from the approved design: the dish strip under the
 * header, the three board cards (Jollof ₦300, Egusi ₦800, Shawarma ₦2,800)
 * and the "₦200 smallest plate on the menu" stat.
 *
 * Prices are per portion — a scoop of rice or a wrap of swallow — which is why
 * they read low next to a whole plate.
 */
const MENU: { category: string; description: string; items: SeedItem[] }[] = [
  {
    category: 'Rice & Pasta',
    description: 'Off the fire from morning',
    items: [
      {
        name: 'Jollof Rice',
        description: 'Party-style, smoky, per portion.',
        price: 300,
        prepMinutes: 10,
        spiceLevel: 2,
        tags: ['rice', 'bestseller'],
        isFeatured: true,
        imageUrl: '/menu/jollof-rice.jpg',
      },
      {
        name: 'Fried Rice',
        description: 'Liver, sweet corn, carrots and green beans.',
        price: 300,
        prepMinutes: 10,
        tags: ['rice'],
      },
      {
        name: 'Chicken Fried Rice',
        description: 'Fried rice cooked down with shredded chicken. One day notice.',
        price: 500,
        prepMinutes: 15,
        tags: ['rice'],
      },
      {
        name: 'Ofada Rice',
        description: 'Native brown rice with ayamase, assorted meat and egg. One day notice.',
        price: 700,
        prepMinutes: 18,
        spiceLevel: 3,
        tags: ['rice', 'spicy'],
        imageUrl: '/menu/ofada-rice-ayamase.jpg',
      },
      {
        name: 'Stir Fry Pasta',
        description: 'Spaghetti tossed in pepper base with vegetables.',
        price: 600,
        prepMinutes: 14,
        spiceLevel: 2,
        tags: ['rice'],
        imageUrl: '/menu/jollof-spaghetti.jpg',
      },
    ],
  },
  {
    category: 'Swallow',
    description: 'Wrapped fresh, per piece',
    items: [
      {
        name: 'Semo',
        description: 'Smooth semolina, per wrap.',
        price: 200,
        prepMinutes: 5,
        tags: ['swallow'],
      },
      {
        name: 'Fufu & Eba',
        description: 'Fufu or garri, your pick, per wrap.',
        price: 200,
        prepMinutes: 5,
        tags: ['swallow'],
        imageUrl: '/menu/fufu-afang.jpg',
      },
      {
        name: 'Pounded Yam',
        description: 'Hand-pounded to order, per wrap.',
        price: 400,
        prepMinutes: 12,
        tags: ['swallow'],
      },
      {
        name: 'Amala',
        description: 'Yam flour swallow, per wrap.',
        price: 250,
        prepMinutes: 8,
        tags: ['swallow'],
        imageUrl: '/menu/amala-ewedu.jpg',
      },
    ],
  },
  {
    category: 'Soups',
    description: 'Simmered down, never rushed',
    items: [
      {
        name: 'Egusi Soup',
        description: 'Melon seed, spinach, assorted.',
        price: 800,
        prepMinutes: 12,
        tags: ['soup'],
        isFeatured: true,
        imageUrl: '/menu/pounded-yam-egusi.jpg',
      },
      {
        name: 'Ogbono Soup',
        description: 'Draw soup with stockfish and shaki.',
        price: 800,
        prepMinutes: 12,
        tags: ['soup'],
      },
      {
        name: 'Okro Soup',
        description: 'Chopped okro with palm oil, fish and beef.',
        price: 700,
        prepMinutes: 12,
        tags: ['soup'],
      },
      {
        name: 'Afang Soup',
        description: 'Afang and waterleaf with snails, shaki and beef.',
        price: 1000,
        prepMinutes: 14,
        tags: ['soup'],
      },
      {
        name: 'Ewedu & Gbegiri',
        description: 'Jute leaves and bean soup with buka stew.',
        price: 500,
        prepMinutes: 10,
        spiceLevel: 2,
        tags: ['soup'],
      },
    ],
  },
  {
    category: 'Beans & Breakfast',
    description: 'From 8am, until the pot finishes',
    items: [
      {
        name: 'Beans',
        description: 'Soft cooked beans with palm oil and pepper.',
        price: 300,
        prepMinutes: 8,
        spiceLevel: 2,
        tags: ['breakfast'],
        imageUrl: '/menu/ewa-agoyin.jpg',
      },
      {
        name: 'Moi Moi',
        description: 'Steamed bean pudding with egg and fish.',
        price: 300,
        prepMinutes: 6,
        tags: ['breakfast'],
      },
      {
        name: 'Yam Porridge',
        description: 'Yam cooked down in pepper and palm oil.',
        price: 700,
        prepMinutes: 15,
        spiceLevel: 2,
        tags: ['breakfast'],
      },
      {
        name: 'Omelette & Dodo',
        description: 'Three-egg omelette with sweet fried plantain.',
        price: 800,
        prepMinutes: 10,
        tags: ['breakfast'],
        imageUrl: '/menu/omelette-plantain.jpg',
      },
    ],
  },
  {
    category: 'Grills & Protein',
    description: 'Off the open grill',
    items: [
      {
        name: 'Shawarma',
        description: 'Chicken, sausage, ketchup and mayo.',
        price: 2800,
        prepMinutes: 12,
        spiceLevel: 2,
        tags: ['grill'],
        isFeatured: true,
        imageUrl: '/menu/chicken-shawarma.jpg',
      },
      {
        name: 'Peppered Chicken',
        description: 'Quarter chicken tossed in scotch bonnet sauce.',
        price: 2000,
        prepMinutes: 18,
        spiceLevel: 3,
        tags: ['grill'],
        imageUrl: '/menu/peppered-chicken.jpg',
      },
      {
        name: 'Suya',
        description: 'Beef skewers in groundnut spice with onions.',
        price: 1500,
        prepMinutes: 15,
        spiceLevel: 3,
        tags: ['grill', 'spicy'],
      },
      {
        name: 'Asun',
        description: 'Smoked goat meat in pepper and onion sauce.',
        price: 2500,
        prepMinutes: 20,
        spiceLevel: 3,
        tags: ['grill', 'spicy'],
      },
      {
        name: 'Grilled Croaker',
        description: 'Whole croaker marinated overnight, with pepper dip.',
        price: 5000,
        prepMinutes: 25,
        spiceLevel: 2,
        tags: ['grill', 'fish'],
      },
    ],
  },
  {
    category: 'Sides',
    description: 'For the table, while you wait',
    items: [
      {
        name: 'Dodo',
        description: 'Sweet fried plantain, per portion.',
        price: 200,
        prepMinutes: 6,
        tags: ['snack'],
      },
      {
        name: 'Puff Puff',
        description: 'Six golden fried dough balls.',
        price: 500,
        prepMinutes: 8,
        tags: ['snack'],
      },
      {
        name: 'Meat Pie',
        description: 'Flaky pastry with minced beef, potato and carrot.',
        price: 700,
        prepMinutes: 5,
        tags: ['snack'],
      },
    ],
  },
  {
    category: 'Drinks',
    description: 'Chilled and blended in-house',
    items: [
      {
        name: 'Chapman',
        description: 'House blend with blackcurrant, bitters and cucumber.',
        price: 1200,
        prepMinutes: 4,
        tags: ['drink', 'signature'],
      },
      {
        name: 'Zobo',
        description: 'Hibiscus with pineapple, ginger and cloves.',
        price: 800,
        prepMinutes: 3,
        tags: ['drink'],
      },
      {
        name: 'Palm Wine',
        description: 'Fresh-tapped, one litre, served cold.',
        price: 2000,
        prepMinutes: 2,
        tags: ['drink'],
      },
      {
        name: 'Bottled Water',
        description: '75cl table water.',
        price: 300,
        prepMinutes: 1,
        tags: ['drink'],
      },
    ],
  },
];

const MODIFIER_GROUPS = [
  {
    name: 'Add protein',
    description: 'Pick any extras to go with it',
    minSelect: 0,
    maxSelect: 3,
    modifiers: [
      { name: 'Fried chicken', priceDelta: 1500 },
      { name: 'Beef', priceDelta: 800 },
      { name: 'Goat meat', priceDelta: 1200 },
      { name: 'Boiled egg', priceDelta: 200 },
      { name: 'Dodo', priceDelta: 200 },
    ],
    appliesTo: ['Rice & Pasta', 'Soups', 'Beans & Breakfast'],
  },
  {
    name: 'Portion size',
    description: 'How hungry are you?',
    minSelect: 1,
    maxSelect: 1,
    modifiers: [
      { name: 'Regular', priceDelta: 0 },
      { name: 'Large', priceDelta: 150 },
    ],
    appliesTo: ['Rice & Pasta', 'Soups', 'Grills & Protein', 'Beans & Breakfast'],
  },
  {
    name: 'Pepper level',
    description: 'We can dial the heat up or down',
    minSelect: 1,
    maxSelect: 1,
    modifiers: [
      { name: 'Mild', priceDelta: 0 },
      { name: 'Medium', priceDelta: 0 },
      { name: 'Extra hot', priceDelta: 0 },
    ],
    appliesTo: ['Rice & Pasta', 'Soups', 'Grills & Protein'],
  },
];


/// Storefront carousel slides. Dates are relative to the seed run so a fresh
/// database always has something live to show.
const PROMOTIONS = [
  {
    kicker: 'Small chops',
    headline: 'Free',
    terms: '* On any order above ₦10,000. Offer runs to {END}',
    ctaLabel: 'See the offer',
    ctaHref: '/menu',
    imageUrl: '/menu/chicken-shawarma.jpg',
    days: 30,
  },
  {
    kicker: 'Jollof + chicken',
    headline: '₦1,200',
    terms: '* Weekday lunch, 12:00 — 15:00. Dine-in or pickup only.',
    ctaLabel: 'Order lunch',
    ctaHref: '/menu',
    imageUrl: '/menu/jollof-rice.jpg',
    days: 60,
  },
  {
    kicker: 'Free delivery',
    headline: 'On campus',
    terms: '* On orders above ₦5,000 delivered inside UI. Offer runs to {END}',
    ctaLabel: 'Start an order',
    ctaHref: '/menu',
    imageUrl: '/menu/pounded-yam-egusi.jpg',
    days: 14,
  },
];

async function seedPromotions(): Promise<number> {
  for (const [index, promo] of PROMOTIONS.entries()) {
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + promo.days);
    const pretty = endsAt.toLocaleDateString('en-NG', {
      day: '2-digit',
      month: 'short',
    });

    const data = {
      kicker: promo.kicker,
      headline: promo.headline,
      terms: promo.terms.replace('{END}', pretty),
      ctaLabel: promo.ctaLabel,
      ctaHref: promo.ctaHref,
      imageUrl: promo.imageUrl,
      position: index,
      isActive: true,
      endsAt,
    };

    // No natural key, so match on the kicker.
    const existing = await prisma.promotion.findFirst({
      where: { kicker: promo.kicker },
    });

    if (existing) {
      await prisma.promotion.update({ where: { id: existing.id }, data });
    } else {
      await prisma.promotion.create({ data });
    }
  }

  return prisma.promotion.count();
}


/*
 * PLACEHOLDER REVIEWS — replace before launch.
 *
 * These exist so the carousel has something to lay out. They are invented,
 * and publishing invented reviews as real customer feedback is dishonest and,
 * in many places, unlawful advertising. Swap them for genuine ones via
 * POST /api/testimonials, or unpublish them.
 */
const TESTIMONIALS = [
  {
    authorName: 'Adaeze O.',
    authorRole: 'SAMPLE — replace with a real review',
    quote:
      'The jollof tastes like a party. Ordered at 12:40, it got to my room in Indy before 1pm and it was still steaming.',
    rating: 5,
  },
  {
    authorName: 'Chinedu A.',
    authorRole: 'SAMPLE — replace with a real review',
    quote:
      'We do the office lunch run here every Friday. Twelve plates, never once mixed up an order, and the ofada is the real thing.',
    rating: 5,
  },
  {
    authorName: 'Bisi T.',
    authorRole: 'SAMPLE — replace with a real review',
    quote:
      'Pounded yam and egusi that tastes like my mother made it. The portions are honest and the pepper is not for beginners.',
    rating: 5,
  },
  {
    authorName: 'Yusuf B.',
    authorRole: 'SAMPLE — replace with a real review',
    quote:
      'Shawarma at 9pm on a Tuesday and it arrived hot. That alone earns the stars. Tracking page actually worked too.',
    rating: 4,
  },
];

async function seedTestimonials(): Promise<number> {
  for (const [index, entry] of TESTIMONIALS.entries()) {
    const existing = await prisma.testimonial.findFirst({
      where: { authorName: entry.authorName },
    });
    const data = { ...entry, position: index, isPublished: true };
    if (existing) {
      await prisma.testimonial.update({ where: { id: existing.id }, data });
    } else {
      await prisma.testimonial.create({ data });
    }
  }
  return prisma.testimonial.count();
}

/*
 * PLACEHOLDER SHOWCASE ENTRIES.
 *
 * Stand-ins so the carousel has something to lay out until real promotion
 * photography is added. They deliberately describe dishes that are actually
 * on the menu rather than inventing events that never happened — swap them
 * for real promotions via POST /api/showcase.
 */
const SHOWCASE = [
  {
    title: 'Party Jollof',
    place: 'SBJ Kitchen · Indy Hall, UI',
    blurb:
      'Smoky, party-style, cooked in the big pot from morning. The plate that built the name.',
    imageUrl: '/menu/jollof-rice.jpg',
    ctaLabel: 'See the menu',
    ctaHref: '/menu',
  },
  {
    title: 'Pounded Yam',
    place: 'Swallow & soup',
    blurb:
      'Hand-pounded to order and served with egusi thick enough to stand a spoon in.',
    imageUrl: '/menu/pounded-yam-egusi.jpg',
    ctaLabel: 'See the menu',
    ctaHref: '/menu',
  },
  {
    title: 'Shawarma',
    place: 'Off the grill',
    blurb:
      'Chicken and sausage rolled hot, wrapped tight, out the door before it cools.',
    imageUrl: '/menu/chicken-shawarma.jpg',
    ctaLabel: 'See the menu',
    ctaHref: '/menu',
  },
  {
    title: 'Ofada Rice',
    place: 'One day notice',
    blurb:
      'Native brown rice under ayamase, assorted meat and egg. Booked a day ahead.',
    imageUrl: '/menu/ofada-rice-ayamase.jpg',
    ctaLabel: 'See the menu',
    ctaHref: '/menu',
  },
  {
    title: 'Ewa Agoyin',
    place: 'From 8am',
    blurb:
      'Soft beans under fried pepper sauce, with agege bread or dodo on the side.',
    imageUrl: '/menu/ewa-agoyin.jpg',
    ctaLabel: 'See the menu',
    ctaHref: '/menu',
  },
];

async function seedShowcase(): Promise<number> {
  for (const [index, entry] of SHOWCASE.entries()) {
    const existing = await prisma.showcase.findFirst({
      where: { title: entry.title },
    });
    const data = { ...entry, position: index, isPublished: true };
    if (existing) {
      await prisma.showcase.update({ where: { id: existing.id }, data });
    } else {
      await prisma.showcase.create({ data });
    }
  }
  return prisma.showcase.count();
}
async function main(): Promise<void> {
  console.log('Seeding SBJ menu...');

  const categoryIds = new Map<string, string>();

  for (const [index, group] of MENU.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: slug(group.category) },
      update: { description: group.description, position: index },
      create: {
        name: group.category,
        slug: slug(group.category),
        description: group.description,
        position: index,
      },
    });
    categoryIds.set(group.category, category.id);

    for (const [itemIndex, item] of group.items.entries()) {
      await prisma.menuItem.upsert({
        where: { slug: slug(item.name) },
        // Every field the seed owns is re-applied, so a dish that moves
        // category or loses a flag actually follows the seed rather than
        // keeping stale values from an earlier run.
        update: {
          categoryId: category.id,
          price: new Prisma.Decimal(item.price),
          description: item.description,
          prepMinutes: item.prepMinutes,
          imageUrl: item.imageUrl ?? null,
          spiceLevel: item.spiceLevel ?? 0,
          tags: item.tags ?? [],
          isFeatured: item.isFeatured ?? false,
          isAvailable: true,
          position: itemIndex,
        },
        create: {
          categoryId: category.id,
          name: item.name,
          slug: slug(item.name),
          description: item.description,
          price: new Prisma.Decimal(item.price),
          prepMinutes: item.prepMinutes,
          imageUrl: item.imageUrl ?? null,
          spiceLevel: item.spiceLevel ?? 0,
          tags: item.tags ?? [],
          isFeatured: item.isFeatured ?? false,
          position: itemIndex,
        },
      });
    }
  }

  for (const [index, groupSeed] of MODIFIER_GROUPS.entries()) {
    // Modifier groups have no natural unique key, so match on name.
    const existing = await prisma.modifierGroup.findFirst({
      where: { name: groupSeed.name },
    });

    const group = existing
      ? await prisma.modifierGroup.update({
          where: { id: existing.id },
          data: {
            description: groupSeed.description,
            minSelect: groupSeed.minSelect,
            maxSelect: groupSeed.maxSelect,
            position: index,
          },
        })
      : await prisma.modifierGroup.create({
          data: {
            name: groupSeed.name,
            description: groupSeed.description,
            minSelect: groupSeed.minSelect,
            maxSelect: groupSeed.maxSelect,
            position: index,
          },
        });

    for (const [modIndex, modifier] of groupSeed.modifiers.entries()) {
      const existingModifier = await prisma.modifier.findFirst({
        where: { groupId: group.id, name: modifier.name },
      });

      // Update, not skip: a price change in this file has to reach the
      // database, otherwise re-seeding silently keeps the old add-on prices.
      if (existingModifier) {
        await prisma.modifier.update({
          where: { id: existingModifier.id },
          data: {
            priceDelta: new Prisma.Decimal(modifier.priceDelta),
            position: modIndex,
            isAvailable: true,
          },
        });
      } else {
        await prisma.modifier.create({
          data: {
            groupId: group.id,
            name: modifier.name,
            priceDelta: new Prisma.Decimal(modifier.priceDelta),
            position: modIndex,
          },
        });
      }
    }

    // Options dropped from this group (or renamed) are switched off rather
    // than deleted — past order lines still point at them.
    await prisma.modifier.updateMany({
      where: {
        groupId: group.id,
        name: { notIn: groupSeed.modifiers.map((m) => m.name) },
      },
      data: { isAvailable: false },
    });

    const targetCategoryIds = groupSeed.appliesTo
      .map((name) => categoryIds.get(name))
      .filter((id): id is string => Boolean(id));

    const items = await prisma.menuItem.findMany({
      where: { categoryId: { in: targetCategoryIds } },
      select: { id: true },
    });

    for (const item of items) {
      await prisma.menuItemModifierGroup.upsert({
        where: {
          menuItemId_groupId: { menuItemId: item.id, groupId: group.id },
        },
        update: { position: index },
        create: { menuItemId: item.id, groupId: group.id, position: index },
      });
    }
  }

  // Dishes dropped from the menu are retired, never deleted: past orders
  // reference them and deleting would rewrite history.
  const liveSlugs = MENU.flatMap((group) => group.items.map((i) => slug(i.name)));
  const retired = await prisma.menuItem.updateMany({
    where: { slug: { notIn: liveSlugs }, isAvailable: true },
    data: { isAvailable: false, isFeatured: false },
  });

  const emptyCategories = await prisma.category.updateMany({
    where: {
      name: { notIn: MENU.map((group) => group.category) },
      isActive: true,
    },
    data: { isActive: false },
  });

  const [categories, items, modifiers] = await Promise.all([
    prisma.category.count({ where: { isActive: true } }),
    prisma.menuItem.count({ where: { isAvailable: true } }),
    prisma.modifier.count(),
  ]);

  if (retired.count || emptyCategories.count) {
    console.log(
      `Retired ${retired.count} off-menu dish(es) and ${emptyCategories.count} category(ies).`,
    );
  }

  const promotions = await seedPromotions();
  const testimonials = await seedTestimonials();
  const showcase = await seedShowcase();

  console.log(
    `Done: ${categories} categories, ${items} menu items, ${modifiers} modifiers, ${promotions} promotions, ${testimonials} testimonials, ${showcase} showcase entries.`,
  );
  console.log(
    'Staff accounts are not seeded — run `npm run create-staff` to make the first ADMIN.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
