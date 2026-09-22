const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const pays = await p.payment.findMany({
    orderBy: { createdAt: 'desc' }, take: 5,
    include: { order: { select: { orderNumber: true, status: true, paymentStatus: true, total: true, placedAt: true } } },
  });
  if (!pays.length) console.log('NO payment rows at all');
  for (const x of pays) {
    console.log({
      ref: x.reference, payStatus: x.status, channel: x.channel,
      amountKobo: x.amount, paidAt: x.paidAt, failure: x.failureReason,
      order: x.order.orderNumber, orderStatus: x.order.status,
      orderPayment: x.order.paymentStatus, total: String(x.order.total),
    });
  }
  const recent = await p.order.findMany({
    orderBy: { placedAt: 'desc' }, take: 5,
    select: { orderNumber: true, status: true, paymentStatus: true, total: true, customerName: true },
  });
  console.log('--- 5 most recent orders ---');
  for (const o of recent) console.log(o.orderNumber, o.status, o.paymentStatus, String(o.total), o.customerName);
  await p.$disconnect();
})();
