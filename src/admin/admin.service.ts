import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay } from '../orders/order-number';

/// Tickets still moving through the kitchen right now.
const LIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

/// How many days of history the trend line covers, today included.
const TREND_DAYS = 7;

/// Rows on the recent-orders table. Enough to see the shape of a service
/// without turning the panel into an order browser.
const RECENT_LIMIT = 25;

function endOfDay(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

function isoDay(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/// Decimal sums come back as Prisma.Decimal or null; the panel wants a plain
/// fixed string it can format without importing Decimal into the browser.
function money(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * Everything the owner's panel shows, in one round trip.
   *
   * A dashboard that fires eight requests is eight chances to render half a
   * picture; this is one query set with one `asOf`, so every number on screen
   * describes the same instant.
   */
  async getOverview(day?: string) {
    // An unparseable ?day= falls back to today rather than 400-ing the panel.
    const requested = day ? new Date(`${day}T00:00:00`) : new Date();
    const date = Number.isNaN(requested.getTime()) ? new Date() : requested;

    const from = startOfDay(date);
    const to = endOfDay(date);

    // Midnight, local, TREND_DAYS - 1 days back. Built by calendar arithmetic
    // rather than subtracting milliseconds so a DST change cannot shift it.
    const trendFrom = startOfDay(date);
    trendFrom.setDate(trendFrom.getDate() - (TREND_DAYS - 1));
    const isToday = isoDay(from) === isoDay(new Date());

    // Cancelled orders are excluded from money everywhere, and counted
    // separately, so revenue never includes a sale that did not happen.
    const soldOnDay: Prisma.OrderWhereInput = {
      placedAt: { gte: from, lt: to },
      status: { not: OrderStatus.CANCELLED },
    };

    const [
      sales,
      cancelled,
      completed,
      byType,
      byPaymentStatus,
      byPaymentMethod,
      byStatus,
      liveCounts,
      hourly,
      topItems,
      recent,
      staff,
      trend,
      menuCounts,
      soldOut,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: soldOnDay,
        _sum: { total: true, subtotal: true, deliveryFee: true, discount: true },
        _count: { _all: true },
        _avg: { total: true },
      }),

      this.prisma.order.aggregate({
        where: { placedAt: { gte: from, lt: to }, status: OrderStatus.CANCELLED },
        _count: { _all: true },
        _sum: { total: true },
      }),

      this.prisma.order.findMany({
        where: {
          completedAt: { gte: from, lt: to },
          status: OrderStatus.COMPLETED,
          startedAt: { not: null },
          readyAt: { not: null },
        },
        select: { startedAt: true, readyAt: true },
      }),

      this.prisma.order.groupBy({
        by: ['type'],
        where: soldOnDay,
        _count: { _all: true },
        _sum: { total: true },
      }),

      this.prisma.order.groupBy({
        by: ['paymentStatus'],
        where: soldOnDay,
        _count: { _all: true },
        _sum: { total: true },
      }),

      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: soldOnDay,
        _count: { _all: true },
        _sum: { total: true },
      }),

      this.prisma.order.groupBy({
        by: ['status'],
        where: { placedAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),

      this.prisma.order.groupBy({
        by: ['status'],
        where: { status: { in: LIVE_STATUSES } },
        _count: { _all: true },
      }),

      /*
        * Bucketing by hour is beyond Prisma's groupBy, so this drops to SQL.
        *
        * It buckets by distance from the start of the service day rather than
        * by EXTRACT(HOUR FROM placed_at): timestamps are stored in UTC while
        * the rest of this report works in the server's local day, so the raw
        * hour would be offset from every other figure on the page.
        */
      this.prisma.$queryRaw<{ hour: number; orders: bigint; revenue: Prisma.Decimal }[]>`
        SELECT FLOOR(EXTRACT(EPOCH FROM (placed_at - ${from})) / 3600)::int AS hour,
               COUNT(*)::bigint                                             AS orders,
               COALESCE(SUM(total), 0)                                      AS revenue
          FROM orders
         WHERE placed_at >= ${from}
           AND placed_at <  ${to}
           AND status <> 'CANCELLED'
         GROUP BY 1
         ORDER BY 1
      `,

      this.prisma.orderItem.groupBy({
        by: ['nameSnapshot'],
        where: { order: soldOnDay },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),

      this.prisma.order.findMany({
        where: { placedAt: { gte: from, lt: to } },
        orderBy: { placedAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          type: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          total: true,
          placedAt: true,
          completedAt: true,
          claimedBy: { select: { fullName: true } },
        },
      }),

      this.prisma.staffProfile.findMany({
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
        },
      }),

      this.prisma.$queryRaw<{ index: number; orders: bigint; revenue: Prisma.Decimal }[]>`
        SELECT FLOOR(EXTRACT(EPOCH FROM (placed_at - ${trendFrom})) / 86400)::int AS index,
               COUNT(*)::bigint                                                   AS orders,
               COALESCE(SUM(total), 0)                                            AS revenue
          FROM orders
         WHERE placed_at >= ${trendFrom}
           AND placed_at <  ${to}
           AND status <> 'CANCELLED'
         GROUP BY 1
         ORDER BY 1
      `,

      this.prisma.menuItem.groupBy({
        by: ['isAvailable'],
        _count: { _all: true },
      }),

      this.prisma.menuItem.findMany({
        where: { isAvailable: false },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, category: { select: { name: true } } },
      }),
    ]);

    const prepMinutes = completed
      .map((order) =>
        order.readyAt && order.startedAt
          ? (order.readyAt.getTime() - order.startedAt.getTime()) / 60000
          : null,
      )
      .filter((minutes): minutes is number => minutes !== null);

    const paid = byPaymentStatus.find(
      (row) => row.paymentStatus === PaymentStatus.PAID,
    );

    // Every hour of the day is present, so the chart has a flat bar at 03:00
    // rather than a gap that reads as missing data.
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const row = hourly.find((entry) => entry.hour === hour);
      return {
        hour,
        orders: Number(row?.orders ?? 0),
        revenue: money(row?.revenue),
      };
    });


    const days = Array.from({ length: TREND_DAYS }, (_, index) => {
      const cursor = new Date(trendFrom);
      cursor.setDate(cursor.getDate() + index);
      const row = trend.find((entry) => entry.index === index);
      return {
        day: isoDay(cursor),
        orders: Number(row?.orders ?? 0),
        revenue: money(row?.revenue),
      };
    });

    return {
      day: isoDay(from),
      isToday,
      asOf: new Date(),

      sales: {
        orders: sales._count._all,
        revenue: money(sales._sum.total),
        subtotal: money(sales._sum.subtotal),
        deliveryFees: money(sales._sum.deliveryFee),
        discounts: money(sales._sum.discount),
        averageOrder: money(sales._avg.total),
        collected: money(paid?._sum.total),
        outstanding: money(
          new Prisma.Decimal(money(sales._sum.total)).minus(
            money(paid?._sum.total),
          ),
        ),
        cancelledOrders: cancelled._count._all,
        cancelledValue: money(cancelled._sum.total),
        completedOrders: completed.length,
        averagePrepMinutes: prepMinutes.length
          ? Math.round(prepMinutes.reduce((a, b) => a + b, 0) / prepMinutes.length)
          : null,
      },

      byType: byType.map((row) => ({
        type: row.type,
        orders: row._count._all,
        revenue: money(row._sum.total),
      })),

      byPaymentStatus: byPaymentStatus.map((row) => ({
        status: row.paymentStatus,
        orders: row._count._all,
        revenue: money(row._sum.total),
      })),

      byPaymentMethod: byPaymentMethod.map((row) => ({
        method: row.paymentMethod,
        orders: row._count._all,
        revenue: money(row._sum.total),
      })),

      byStatus: byStatus.map((row) => ({
        status: row.status,
        orders: row._count._all,
      })),

      live: {
        total: liveCounts.reduce((sum, row) => sum + row._count._all, 0),
        byStatus: liveCounts.map((row) => ({
          status: row.status,
          orders: row._count._all,
        })),
      },

      hours,
      days,

      topItems: topItems.map((row) => ({
        name: row.nameSnapshot,
        quantity: row._sum.quantity ?? 0,
        revenue: money(row._sum.lineTotal),
      })),

      recent: recent.map((order) => ({
        ...order,
        total: order.total.toFixed(2),
        claimedBy: order.claimedBy?.fullName ?? null,
      })),

      staff,

      menu: {
        available:
          menuCounts.find((row) => row.isAvailable)?._count._all ?? 0,
        soldOut: menuCounts.find((row) => !row.isAvailable)?._count._all ?? 0,
        soldOutItems: soldOut.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category.name,
        })),
      },
    };
  }
}
