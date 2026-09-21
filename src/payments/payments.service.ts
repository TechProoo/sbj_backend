import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { OrdersGateway } from '../events/orders.gateway';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InitializePaymentDto } from './dto/payment.dto';
import { PaystackService, PaystackTransaction } from './paystack.service';

/// How Paystack names a channel, mapped onto the enum the cashier's screen and
/// the takings report already use. Anything unrecognised is still a real
/// online payment, so it falls back to ONLINE rather than being dropped.
const CHANNEL_TO_METHOD: Record<string, PaymentMethod> = {
  card: PaymentMethod.CARD,
  bank: PaymentMethod.TRANSFER,
  bank_transfer: PaymentMethod.TRANSFER,
  dedicated_nuban: PaymentMethod.TRANSFER,
  eft: PaymentMethod.TRANSFER,
  ussd: PaymentMethod.TRANSFER,
  qr: PaymentMethod.ONLINE,
  mobile_money: PaymentMethod.ONLINE,
  apple_pay: PaymentMethod.CARD,
};

/// An authorization_url Paystack issued longer ago than this is assumed dead,
/// and a fresh attempt is started rather than handing back a link that 404s.
const REUSE_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paystack: PaystackService,
    private readonly orders: OrdersService,
    private readonly gateway: OrdersGateway,
  ) {}

  /// What the storefront needs to decide whether to offer online payment. The
  /// public key is safe to publish; the secret key never leaves this server.
  getPublicConfig() {
    return {
      enabled: this.paystack.isConfigured,
      publicKey: this.paystack.publicKey,
      testMode: this.paystack.isTestMode,
      channels: this.paystack.channels,
    };
  }

  /// Every attempt made against one order, newest first. The raw provider
  /// body is withheld — it is kept for disputes, not for a dashboard.
  async listForOrder(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        providerId: true,
        status: true,
        channel: true,
        method: true,
        amount: true,
        currency: true,
        paidAt: true,
        failureReason: true,
        createdAt: true,
      },
    });
  }

  // ------------------------------------------------------------ initialize

  async initialize(dto: InitializePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictException('This order was cancelled');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('This order is already paid for');
    }

    // Kobo, taken from the total the server itself computed at checkout. The
    // client never names an amount — it names an order.
    const amount = order.total.mul(100).toDecimalPlaces(0).toNumber();
    if (amount < 100) {
      throw new BadRequestException('Paystack cannot charge less than NGN 1');
    }

    const email = dto.email?.trim() || order.customerEmail?.trim();
    if (!email) {
      throw new BadRequestException(
        'An email address is needed to pay online — Paystack sends the receipt to it',
      );
    }

    // Double-tapping the pay button should not open a second attempt.
    const reusable = order.payments.find(
      (payment) =>
        payment.status === PaymentStatus.UNPAID &&
        payment.amount === amount &&
        payment.authorizationUrl &&
        Date.now() - payment.createdAt.getTime() < REUSE_WINDOW_MS,
    );
    if (reusable) {
      return {
        reference: reusable.reference,
        authorizationUrl: reusable.authorizationUrl,
        accessCode: reusable.accessCode,
        amount: reusable.amount,
        email,
        testMode: this.paystack.isTestMode,
      };
    }

    // Keep the email for the receipt and for this customer's next order.
    if (email !== order.customerEmail) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { customerEmail: email },
      });
      await this.prisma.customer
        .update({ where: { phone: order.customerPhone }, data: { email } })
        .catch(() => undefined);
    }

    const initialized = await this.paystack.initialize({
      email,
      amount,
      reference: buildReference(order.orderNumber),
      callbackUrl: this.config.get<string>('paystack.callbackUrl') ?? '',
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.type,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        // Shown on the transaction's detail page in the Paystack dashboard.
        custom_fields: [
          {
            display_name: 'Order',
            variable_name: 'order_number',
            value: order.orderNumber,
          },
          {
            display_name: 'Customer',
            variable_name: 'customer',
            value: `${order.customerName} · ${order.customerPhone}`,
          },
        ],
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        reference: initialized.reference,
        amount,
        authorizationUrl: initialized.authorization_url,
        accessCode: initialized.access_code,
      },
    });

    this.logger.log(
      `Payment ${payment.reference} opened for ${order.orderNumber} (${amount / 100} NGN)`,
    );

    return {
      reference: payment.reference,
      authorizationUrl: payment.authorizationUrl,
      accessCode: payment.accessCode,
      amount: payment.amount,
      email,
      testMode: this.paystack.isTestMode,
    };
  }

  // ------------------------------------------------------------ verify

  /// Called by the page Paystack redirects back to. The webhook is the
  /// authority, but it can arrive late — or never, in local development where
  /// Paystack cannot reach localhost — so the customer's own return trip
  /// re-asks Paystack directly and applies the same idempotent update.
  async verify(reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!payment) throw new NotFoundException('Unknown payment reference');

    const transaction = await this.paystack.verify(reference);
    const applied = await this.apply(transaction, 'verify');

    return {
      reference,
      status: applied?.status ?? payment.status,
      paid: applied?.status === PaymentStatus.PAID,
      channel: applied?.channel ?? payment.channel,
      amount: payment.amount,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      gatewayResponse: transaction.gateway_response ?? null,
    };
  }

  // ------------------------------------------------------------ webhook

  async handleWebhook(rawBody: Buffer | undefined, signature?: string) {
    if (!rawBody?.length) {
      throw new BadRequestException('Empty webhook body');
    }
    if (!this.paystack.verifyWebhookSignature(rawBody, signature)) {
      // Anyone at all can POST to this route; only Paystack can sign for it.
      this.logger.warn('Rejected a webhook with a bad or missing signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: PaystackTransaction;
    };

    if (!event.data?.reference) return { received: true };

    switch (event.event) {
      case 'charge.success':
        await this.apply(event.data, 'webhook');
        break;
      case 'refund.processed':
        await this.applyRefund(event.data);
        break;
      default:
        this.logger.debug(`Ignoring Paystack event ${event.event}`);
    }

    // Always 200. A non-2xx makes Paystack retry, and an event we chose not to
    // act on is not a failure worth retrying.
    return { received: true };
  }

  // ------------------------------------------------------------ the update

  /// Writes a Paystack transaction onto our own records. Safe to call twice
  /// with the same body — the webhook and the customer's redirect routinely
  /// race, and Paystack retries webhooks it thinks went unanswered.
  private async apply(
    transaction: PaystackTransaction,
    source: 'webhook' | 'verify',
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference: transaction.reference },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(
        `Paystack ${source}: reference ${transaction.reference} is not ours`,
      );
      return null;
    }

    if (payment.status === PaymentStatus.PAID) {
      return payment; // Already settled; nothing to redo.
    }

    if (transaction.status !== 'success') {
      // `ongoing`/`pending` is a transfer the customer has not finished yet —
      // leave the attempt open rather than marking it failed under them.
      if (transaction.status === 'ongoing' || transaction.status === 'pending') {
        return payment;
      }

      const failed = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerId: String(transaction.id ?? ''),
          channel: resolveChannel(transaction),
          failureReason: transaction.gateway_response ?? transaction.status,
          rawResponse: transaction as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.warn(
        `Payment ${payment.reference} failed: ${failed.failureReason}`,
      );
      return failed;
    }

    // Paystack charges exactly what we initialised, so a short payment means
    // the reference was played against a different amount. Record it, but do
    // not mark an order paid on someone else's say-so.
    if (transaction.amount < payment.amount) {
      this.logger.error(
        `Payment ${payment.reference} underpaid: got ${transaction.amount}, expected ${payment.amount}`,
      );
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerId: String(transaction.id ?? ''),
          failureReason: `Underpaid: ${transaction.amount} of ${payment.amount} kobo`,
          rawResponse: transaction as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const channel = resolveChannel(transaction);
    const method = CHANNEL_TO_METHOD[channel ?? ''] ?? PaymentMethod.ONLINE;
    const paidAt = transaction.paid_at
      ? new Date(transaction.paid_at)
      : new Date();

    const [updated] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          providerId: String(transaction.id ?? ''),
          channel,
          method,
          paidAt,
          failureReason: null,
          rawResponse: transaction as unknown as Prisma.InputJsonValue,
        },
      }),
      // The order keeps the quick answer the kitchen board reads. Fulfilment
      // status is deliberately untouched: a paid ticket still waits for the
      // kitchen to accept it, exactly like a cash one.
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: method,
          paymentRef: payment.reference,
          events: {
            create: {
              fromStatus: payment.order.status,
              toStatus: payment.order.status,
              note: `Paid ${formatNaira(transaction.amount)} by ${channel ?? 'Paystack'} (${payment.reference})`,
            },
          },
        },
      }),
    ]);

    this.logger.log(
      `Payment ${payment.reference} confirmed via ${source} — ${payment.order.orderNumber} is PAID`,
    );

    await this.broadcast(payment.orderId);
    return updated;
  }

  private async applyRefund(transaction: PaystackTransaction) {
    // A refund event names the transaction it reverses, not itself.
    const reference =
      (transaction as { transaction_reference?: string })
        .transaction_reference ?? transaction.reference;

    const payment = await this.prisma.payment.findUnique({
      where: { reference },
    });
    if (!payment) return;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          rawResponse: transaction as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      }),
    ]);

    this.logger.log(`Payment ${payment.reference} refunded`);
    await this.broadcast(payment.orderId);
  }

  /// Push the change to every kitchen screen and to the customer's own
  /// tracking page, so the PAID badge appears without anyone refreshing.
  private async broadcast(orderId: string): Promise<void> {
    try {
      const order = await this.orders.findOne(orderId);
      this.gateway.emitOrderUpdated(order);
    } catch (error) {
      // A broadcast failure must never undo a confirmed payment.
      this.logger.error(
        `Could not broadcast payment for ${orderId}`,
        error as Error,
      );
    }
  }
}

/// e.g. `SBJ-2419-9F3A2C`. Paystack requires the reference to be unique across
/// the whole account, so the order number alone will not do once a customer
/// retries after a declined card.
function buildReference(orderNumber: string): string {
  return `${orderNumber}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function resolveChannel(transaction: PaystackTransaction): string | null {
  return transaction.channel ?? transaction.authorization?.channel ?? null;
}

function formatNaira(kobo: number): string {
  return `NGN ${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}
