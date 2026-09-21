import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { StaffRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';

/// Rooms
/// - `kitchen`   every authenticated kitchen/manager screen
/// - `order:<id>` one customer watching their own order
export const KITCHEN_ROOM = 'kitchen';
export const orderRoom = (orderId: string): string => `order:${orderId}`;

export const ORDER_EVENTS = {
  created: 'order:created',
  updated: 'order:updated',
  statusChanged: 'order:status-changed',
  cancelled: 'order:cancelled',
  itemStatusChanged: 'order:item-status-changed',
} as const;

export type OrderEventName = (typeof ORDER_EVENTS)[keyof typeof ORDER_EVENTS];

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /// Customers connect anonymously and may only subscribe to a single order
  /// they can name. Staff must present a valid token to join the kitchen room.
  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      extractBearer(client.handshake.headers.authorization);

    if (!token) {
      client.data.role = null;
      return;
    }

    try {
      const claims = await this.tokens.verify(token);
      const staff = await this.prisma.staffProfile.findUnique({
        where: { id: claims.sub },
      });

      if (staff?.isActive) {
        client.data.userId = staff.id;
        client.data.role = staff.role;
        await client.join(KITCHEN_ROOM);
        this.logger.log(`${staff.fullName} joined the kitchen board`);
      }
    } catch {
      // An unusable token just means this socket stays a guest.
      client.data.role = null;
    }
  }

  handleDisconnect(client: Socket): void {
    if (client.data?.role) {
      this.logger.log(`Kitchen client ${client.id} disconnected`);
    }
  }

  /// A customer watching their order status page.
  @SubscribeMessage('subscribe:order')
  async subscribeToOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId?: string },
  ): Promise<{ ok: boolean }> {
    if (!payload?.orderId) return { ok: false };
    await client.join(orderRoom(payload.orderId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe:order')
  async unsubscribeFromOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId?: string },
  ): Promise<{ ok: boolean }> {
    if (!payload?.orderId) return { ok: false };
    await client.leave(orderRoom(payload.orderId));
    return { ok: true };
  }

  emitOrderCreated(order: { id: string }): void {
    this.server?.to(KITCHEN_ROOM).emit(ORDER_EVENTS.created, order);
  }

  /// Staff see the whole order; the customer room gets the same payload so the
  /// tracking page can show line-level progress.
  emitOrderUpdated(
    order: { id: string },
    event: OrderEventName = ORDER_EVENTS.updated,
  ): void {
    this.server?.to(KITCHEN_ROOM).emit(event, order);
    this.server?.to(orderRoom(order.id)).emit(event, order);
  }

  isKitchenStaff(client: Socket): boolean {
    const role = client.data?.role as StaffRole | null | undefined;
    return Boolean(role);
  }
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? value : undefined;
}
