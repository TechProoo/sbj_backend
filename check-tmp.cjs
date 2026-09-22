const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const o = await p.order.findUnique({
    where: { orderNumber: 'SBJ-2109-001' },
    select: { id: true, paymentStatus: true, payments: { select: { reference: true } } },
  });
  console.log('order id :', o.id);
  console.log('receipt  : http://localhost:5173/order/' + o.id);
  console.log('callback : http://localhost:5173/payment/callback?reference=' + o.payments[0].reference);
  await p.$disconnect();
})();
