import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay } from '../orders/order-number';

/// Statuses that belong on the board. COMPLETED and CANCELLED tickets fall off.
const LIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

const ticketInclude = {
  items: {
    include: { modifiers: { select: { nameSnapshot: true } } },
    orderBy: { nameSnapshot: 'asc' },
  },
  address: {
    select: {
      line1: true,
      city: true,
      landmark: true,
      latitude: true,
      longitude: true,
      accuracyMeters: true,
    },
  },
  claimedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  /// Everything the dashboard needs for a full repaint: live tickets oldest
  /// first, because the oldest ticket is always the most urgent.
  async getBoard() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: LIVE_STATUSES } },
      include: ticketInclude,
      orderBy: { placedAt: 'asc' },
    });

    const columns = {
      [OrderStatus.PENDING]: [] as typeof orders,
      [OrderStatus.CONFIRMED]: [] as typeof orders,
      [OrderStatus.PREPARING]: [] as typeof orders,
      [OrderStatus.READY]: [] as typeof orders,
    };

    for (const order of orders) {
      const column = columns[order.status as keyof typeof columns];
      if (column) column.push(order);
    }

    return { columns, total: orders.length, fetchedAt: new Date() };
  }

  /// Header counters. Averages come from tickets closed today only — a week
  /// old average tells a cook nothing about tonight's service.
  async getStats() {
    const since = startOfDay();

    const [statusCounts, completedToday, salesToday] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { status: { in: LIVE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.COMPLETED,
          completedAt: { gte: since },
          startedAt: { not: null },
          readyAt: { not: null },
        },
        select: { startedAt: true, readyAt: true },
      }),
      this.prisma.order.aggregate({
        where: { placedAt: { gte: since }, status: { not: OrderStatus.CANCELLED } },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

    const prepTimes = completedToday
      .map((order) =>
        order.readyAt && order.startedAt
          ? (order.readyAt.getTime() - order.startedAt.getTime()) / 60000
          : null,
      )
      .filter((minutes): minutes is number => minutes !== null);

    const averagePrepMinutes = prepTimes.length
      ? Math.round(
          (prepTimes.reduce((sum, value) => sum + value, 0) /
            prepTimes.length) *
            10,
        ) / 10
      : null;

    const live = Object.fromEntries(
      statusCounts.map((row) => [row.status, row._count._all]),
    ) as Partial<Record<OrderStatus, number>>;

    return {
      live: {
        pending: live.PENDING ?? 0,
        confirmed: live.CONFIRMED ?? 0,
        preparing: live.PREPARING ?? 0,
        ready: live.READY ?? 0,
      },
      today: {
        orders: salesToday._count._all,
        revenue: salesToday._sum.total?.toString() ?? '0',
        completed: completedToday.length,
        averagePrepMinutes,
      },
    };
  }

  /// Items switched off during service, so the board can offer to switch them
  /// back on at the start of the next one.
  listSoldOutItems() {
    return this.prisma.menuItem.findMany({
      where: { isAvailable: false },
      select: { id: true, name: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
