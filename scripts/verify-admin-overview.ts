/*
 * Throwaway check for the owner's panel figures.
 *
 * Builds a day of trading inside a transaction, runs the real AdminService
 * against that transaction, asserts the numbers, then rolls the whole thing
 * back — the database is left exactly as it was found.
 *
 *   npx ts-node -r dotenv/config scripts/verify-admin-overview.ts
 */
import { OrderStatus, OrderType, PaymentMethod, PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { AdminService } from '../src/admin/admin.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  PASS  ${label} = ${a}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}: expected ${e}, got ${a}`);
  }
}

function at(hour: number): Date {
  const date = new Date();
  date.setHours(hour, 15, 0, 0);
  return date;
}

async function main(): Promise<void> {
  const dishes = await prisma.menuItem.findMany({ take: 2, orderBy: { name: 'asc' } });
  if (dishes.length < 2) throw new Error('Seed the menu first: npm run seed');

  const [jollof, second] = dishes;

  try {
    await prisma.$transaction(
      async (tx) => {
        const order = async (opts: {
          number: string;
          type: OrderType;
          status: OrderStatus;
          payment: PaymentStatus;
          method: PaymentMethod | null;
          total: number;
          hour: number;
          items: { dish: typeof jollof; qty: number; price: number }[];
        }) =>
          tx.order.create({
            data: {
              orderNumber: opts.number,
              customerName: 'Verification',
              customerPhone: '08000000000',
              type: opts.type,
              status: opts.status,
              paymentStatus: opts.payment,
              paymentMethod: opts.method,
              subtotal: new Prisma.Decimal(opts.total),
              total: new Prisma.Decimal(opts.total),
              placedAt: at(opts.hour),
              startedAt: at(opts.hour),
              readyAt: new Date(at(opts.hour).getTime() + 20 * 60000),
              completedAt:
                opts.status === OrderStatus.COMPLETED
                  ? new Date(at(opts.hour).getTime() + 25 * 60000)
                  : null,
              items: {
                create: opts.items.map((line) => ({
                  menuItemId: line.dish.id,
                  nameSnapshot: line.dish.name,
                  unitPrice: new Prisma.Decimal(line.price),
                  quantity: line.qty,
                  lineTotal: new Prisma.Decimal(line.price * line.qty),
                })),
              },
            },
          });

        // Two real sales, one of them still unpaid, plus a cancellation that
        // must not reach the takings.
        await order({
          number: 'VERIFY-001',
          type: OrderType.DELIVERY,
          status: OrderStatus.COMPLETED,
          payment: PaymentStatus.PAID,
          method: PaymentMethod.TRANSFER,
          total: 10000,
          hour: 12,
          items: [{ dish: jollof, qty: 4, price: 2500 }],
        });

        await order({
          number: 'VERIFY-002',
          type: OrderType.PICKUP,
          status: OrderStatus.READY,
          payment: PaymentStatus.UNPAID,
          method: null,
          total: 3000,
          hour: 12,
          items: [{ dish: second, qty: 2, price: 1500 }],
        });

        await order({
          number: 'VERIFY-003',
          type: OrderType.DELIVERY,
          status: OrderStatus.CANCELLED,
          payment: PaymentStatus.UNPAID,
          method: null,
          total: 9999,
          hour: 13,
          items: [{ dish: jollof, qty: 9, price: 1111 }],
        });

        // The real service, pointed at the uncommitted transaction.
        const admin = new AdminService(tx as unknown as PrismaService);
        const report = await admin.getOverview();

        console.log('\nDay under test:', report.day, '\n');

        check('orders counted (cancelled excluded)', report.sales.orders, 2);
        check('revenue', report.sales.revenue, '13000.00');
        check('collected (paid only)', report.sales.collected, '10000.00');
        check('outstanding', report.sales.outstanding, '3000.00');
        check('average order', report.sales.averageOrder, '6500.00');
        check('cancelled orders', report.sales.cancelledOrders, 1);
        check('cancelled value kept out of revenue', report.sales.cancelledValue, '9999.00');
        check('completed orders', report.sales.completedOrders, 1);
        check('average prep minutes', report.sales.averagePrepMinutes, 20);

        const noon = report.hours.find((h) => h.hour === 12);
        check('12:00 bucket revenue', noon?.revenue, '13000.00');
        check('12:00 bucket orders', noon?.orders, 2);
        const onePm = report.hours.find((h) => h.hour === 13);
        check('13:00 bucket excludes the cancellation', onePm?.revenue, '0.00');
        check('all 24 hours present', report.hours.length, 24);

        check('today is the last day of the trend', report.days[6]?.revenue, '13000.00');
        check('trend covers seven days', report.days.length, 7);

        check(
          'top item is the biggest line total',
          report.topItems[0],
          { name: jollof.name, quantity: 4, revenue: '10000.00' },
        );
        check('cancelled items are not in top items', report.topItems.length, 2);

        check(
          'delivery breakdown',
          report.byType.find((r) => r.type === 'DELIVERY'),
          { type: 'DELIVERY', orders: 1, revenue: '10000.00' },
        );
        check(
          'pickup breakdown',
          report.byType.find((r) => r.type === 'PICKUP'),
          { type: 'PICKUP', orders: 1, revenue: '3000.00' },
        );
        check(
          'transfer payments',
          report.byPaymentMethod.find((r) => r.method === 'TRANSFER'),
          { method: 'TRANSFER', orders: 1, revenue: '10000.00' },
        );
        check('ledger lists every ticket of the day', report.recent.length, 3);

        throw new Error('ROLLBACK');
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'ROLLBACK') throw error;
    console.log('\nTransaction rolled back — no rows kept.');
  }

  const left = await prisma.order.count({
    where: { orderNumber: { startsWith: 'VERIFY-' } },
  });
  check('rows left behind', left, 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
