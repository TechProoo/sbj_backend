import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

/// What the customer sees on their lock screen at each step. Only the stages
/// worth interrupting someone for are here: PENDING is the moment they placed
/// the order, so telling them about it is noise.
const NOTICE: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  CONFIRMED: {
    title: 'Order confirmed',
    body: 'The kitchen has your ticket and is starting shortly.',
  },
  PREPARING: {
    title: 'Your food is cooking',
    body: 'It is on the fire now.',
  },
  READY: {
    title: 'Ready',
    body: 'Hot and plated — on its way out to you.',
  },
  COMPLETED: {
    title: 'Enjoy your meal',
    body: 'Thanks for ordering from SBJ.',
  },
  CANCELLED: {
    title: 'Order cancelled',
    body: 'Call us if that looks wrong.',
  },
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private configured = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('push.publicKey') ?? '';
    const privateKey = this.config.get<string>('push.privateKey') ?? '';
    const subject = this.config.get<string>('push.subject') ?? '';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not set — push notifications are off. Run `npm run push-keys` and put them in .env.',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.configured = true;
    this.logger.log('Web push ready');
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  /// The browser needs this to create a subscription. Public by design — it
  /// is the public half of the VAPID pair.
  getPublicKey(): { enabled: boolean; publicKey: string } {
    return { enabled: this.configured, publicKey: this.publicKey };
  }

  async subscribe(dto: SubscribeDto): Promise<{ ok: boolean }> {
    // Re-subscribing from the same device for the same order re-activates the
    // existing row rather than piling up duplicates.
    await this.prisma.pushSubscription.upsert({
      where: {
        endpoint_orderId: { endpoint: dto.endpoint, orderId: dto.orderId },
      },
      update: { p256dh: dto.p256dh, auth: dto.auth, isActive: true },
      create: {
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        orderId: dto.orderId,
      },
    });

    return { ok: true };
  }

  async unsubscribe(endpoint: string): Promise<{ ok: boolean }> {
    await this.prisma.pushSubscription.updateMany({
      where: { endpoint },
      data: { isActive: false },
    });
    return { ok: true };
  }

  /// Fire-and-forget: a push that fails must never fail the status change that
  /// triggered it. The kitchen bumping a ticket is the important part.
  async notifyOrderStatus(
    orderId: string,
    orderNumber: string,
    status: OrderStatus,
  ): Promise<void> {
    if (!this.configured) return;

    const notice = NOTICE[status];
    if (!notice) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { orderId, isActive: true },
    });
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title: `${notice.title} · ${orderNumber}`,
      body: notice.body,
      orderId,
      url: `/order/${orderId}`,
      tag: `order-${orderId}`,
    });

    const dead: string[] = [];

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          // 404/410 mean the browser threw the subscription away.
          if (statusCode === 404 || statusCode === 410) {
            dead.push(subscription.id);
          } else {
            this.logger.warn(
              `Push to ${subscription.endpoint.slice(0, 40)}… failed: ${
                (error as Error).message
              }`,
            );
          }
        }
      }),
    );

    if (dead.length > 0) {
      await this.prisma.pushSubscription.updateMany({
        where: { id: { in: dead } },
        data: { isActive: false },
      });
      this.logger.log(`Retired ${dead.length} expired push subscription(s)`);
    }
  }
}
