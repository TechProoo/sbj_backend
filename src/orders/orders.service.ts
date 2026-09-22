import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderChannel,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ORDER_EVENTS, OrdersGateway } from '../events/orders.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { CreateCounterOrderDto } from './dto/create-counter-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import {
  CancelOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
} from './dto/update-order.dto';
import { startOfDay, withOrderNumberRetry } from './order-number';

const orderInclude = {
  items: {
    include: { modifiers: true, menuItem: { select: { prepMinutes: true } } },
    orderBy: { nameSnapshot: 'asc' },
  },
  address: true,
  claimedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.OrderInclude;

/// Only these moves are legal. Anything else is a bug in a client, not a
/// state the kitchen should be able to reach by double-tapping a button.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.PREPARING],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: OrdersGateway,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------ checkout

  /*
   * `options` is what separates a counter ticket from guest checkout. The
   * pricing, validation and creation below stay a single path on purpose: two
   * of them would drift, and the one that drifts is always the one handling
   * money.
   */
  async create(
    dto: CreateOrderDto,
    channel: OrderChannel = OrderChannel.ONLINE,
    options: {
      /// The staff member typing it in, recorded on the order's first event.
      actorId?: string | null;
      /// Counter orders skip PENDING: a human already accepted them.
      autoConfirm?: boolean;
      /// Cash in the till before the ticket is even printed.
      markPaid?: boolean;
      /// The online minimum has no meaning at the till.
      skipMinimum?: boolean;
      /// Staff are standing next to the customer; a table number is a nicety.
      requireTableNumber?: boolean;
    } = {},
  ) {
    const {
      actorId = null,
      autoConfirm = false,
      markPaid = false,
      skipMinimum = false,
      requireTableNumber = true,
    } = options;

    if (dto.type === OrderType.DELIVERY && !dto.address) {
      throw new BadRequestException('Delivery orders need an address');
    }
    if (
      requireTableNumber &&
      dto.type === OrderType.DINE_IN &&
      !dto.tableNumber
    ) {
      throw new BadRequestException('Dine-in orders need a table number');
    }

    const lines = await this.priceLines(dto);
    const subtotal = lines.reduce(
      (sum, line) => sum.add(line.lineTotal),
      new Prisma.Decimal(0),
    );

    const deliveryFee =
      dto.type === OrderType.DELIVERY
        ? new Prisma.Decimal(this.config.get<number>('orders.deliveryFee') ?? 0)
        : new Prisma.Decimal(0);

    const serviceFeePercent =
      this.config.get<number>('orders.serviceFeePercent') ?? 0;
    const serviceFee = subtotal
      .mul(serviceFeePercent)
      .div(100)
      .toDecimalPlaces(2);

    const total = subtotal.add(deliveryFee).add(serviceFee);

    const minimum = skipMinimum
      ? 0
      : (this.config.get<number>('orders.minOrderTotal') ?? 0);
    if (subtotal.lessThan(minimum)) {
      throw new BadRequestException(
        `Minimum order is ${minimum}. Your items come to ${subtotal.toFixed(2)}.`,
      );
    }

    // No phone, no customer record: every anonymous walk-in would otherwise
    // collapse into one shared customer row.
    const customer = dto.customerPhone ? await this.upsertCustomer(dto) : null;

    // Saved to the customer's address book first so it survives as a reusable
    // address rather than being buried inside one order.
    const address =
      dto.address && customer
        ? await this.prisma.address.create({
            data: { ...dto.address, customerId: customer.id },
          })
        : null;

    const order = await withOrderNumberRetry(
      (orderNumber) =>
        this.prisma.order.create({
          data: {
            orderNumber,
            channel,
            type: dto.type,
            status: autoConfirm ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
            confirmedAt: autoConfirm ? new Date() : null,
            paymentStatus: markPaid ? PaymentStatus.PAID : PaymentStatus.UNPAID,
            customerId: customer?.id,
            addressId: address?.id,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            customerEmail: dto.customerEmail,
            tableNumber: dto.tableNumber,
            notes: dto.notes,
            paymentMethod: dto.paymentMethod,
            subtotal,
            deliveryFee,
            serviceFee,
            total,
            items: {
              create: lines.map((line) => ({
                menuItemId: line.menuItemId,
                nameSnapshot: line.nameSnapshot,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
                notes: line.notes,
                modifiers: { create: line.modifiers },
              })),
            },
            events: {
              create: {
                actorId,
                toStatus: autoConfirm
                  ? OrderStatus.CONFIRMED
                  : OrderStatus.PENDING,
                note: autoConfirm
                  ? `Taken at the counter${markPaid ? ', paid' : ', unpaid'}`
                  : 'Order placed',
              },
            },
          },
          include: orderInclude,
        }),
      () => this.nextDailySequence(),
    );

    this.gateway.emitOrderCreated(order);
    this.logger.log(`New order ${order.orderNumber} (${order.type})`);
    return order;
  }

  /*
   * A ticket typed in by staff — the walk-in paying cash, or the regular who
   * phones their order through.
   *
   * Prices still come from the database, exactly as they do for a customer:
   * the till is a trusted room, not a trusted input.
   */
  async createManual(dto: CreateCounterOrderDto, actorId: string | null) {
    const paid = dto.paid ?? false;

    const order = await this.create(
      {
        // A queue moves faster than a keyboard; both of these are optional at
        // the counter and the ticket just says who it is for.
        customerName: dto.customerName?.trim() || 'Walk-in',
        customerPhone: dto.customerPhone ?? '',
        type: dto.type,
        items: dto.items,
        address: dto.address,
        tableNumber: dto.tableNumber,
        // Cash is the default here, because that is what this exists for.
        paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
        notes: dto.notes,
      },
      dto.channel ?? OrderChannel.WALK_IN,
      {
        actorId,
        autoConfirm: true,
        markPaid: paid,
        skipMinimum: true,
        requireTableNumber: false,
      },
    );

    this.logger.log(
      `Counter order ${order.orderNumber} (${order.type}, ${paid ? 'paid' : 'unpaid'})`,
    );
    return order;
  }

  /// Recomputes every price from the database. The client sends ids and
  /// quantities only — a cart total posted from a browser is a suggestion.
  private async priceLines(dto: CreateOrderDto) {
    const menuItemIds = [...new Set(dto.items.map((item) => item.menuItemId))];

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: {
        modifierGroups: {
          include: { group: { include: { modifiers: true } } },
        },
      },
    });

    const byId = new Map(menuItems.map((item) => [item.id, item]));

    return dto.items.map((line) => {
      const menuItem = byId.get(line.menuItemId);
      if (!menuItem) {
        throw new BadRequestException(`Menu item ${line.menuItemId} not found`);
      }
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`${menuItem.name} is sold out`);
      }

      const allowedModifiers = new Map(
        menuItem.modifierGroups
          .flatMap((link) => link.group.modifiers)
          .map((modifier) => [modifier.id, modifier]),
      );

      const chosen = (line.modifierIds ?? []).map((id) => {
        const modifier = allowedModifiers.get(id);
        if (!modifier) {
          throw new BadRequestException(
            `Option ${id} is not available on ${menuItem.name}`,
          );
        }
        if (!modifier.isAvailable) {
          throw new BadRequestException(`${modifier.name} is sold out`);
        }
        return modifier;
      });

      const unitPrice = chosen.reduce(
        (sum, modifier) => sum.add(modifier.priceDelta),
        menuItem.price,
      );

      return {
        menuItemId: menuItem.id,
        nameSnapshot: menuItem.name,
        unitPrice,
        quantity: line.quantity,
        lineTotal: unitPrice.mul(line.quantity).toDecimalPlaces(2),
        notes: line.notes,
        modifiers: chosen.map((modifier) => ({
          modifierId: modifier.id,
          nameSnapshot: modifier.name,
          priceDelta: modifier.priceDelta,
        })),
      };
    });
  }

  /// Guests are matched on phone so a repeat caller keeps one history.
  private async upsertCustomer(dto: CreateOrderDto) {
    return this.prisma.customer.upsert({
      where: { phone: dto.customerPhone },
      update: {
        fullName: dto.customerName,
        ...(dto.customerEmail ? { email: dto.customerEmail } : {}),
      },
      create: {
        fullName: dto.customerName,
        phone: dto.customerPhone,
        email: dto.customerEmail,
      },
    });
  }

  private async nextDailySequence(): Promise<number> {
    const count = await this.prisma.order.count({
      where: { placedAt: { gte: startOfDay() } },
    });
    return count + 1;
  }

  // ------------------------------------------------------------ reads

  async findAll(query: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = {};

    if (query.status?.length) where.status = { in: query.status };
    if (query.type) where.type = query.type;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.from || query.to) {
      where.placedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search } },
      ];
    }

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total, take: query.take ?? 50, skip: query.skip ?? 0 };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...orderInclude,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /// The customer's own copy, fetched by the uuid they were handed at
  /// checkout. Unlike the order number that uuid is not guessable, so it
  /// stands on its own as the capability — but the payload is still trimmed
  /// to what a receipt shows, never the staff view.
  async receipt(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        tableNumber: true,
        notes: true,
        subtotal: true,
        deliveryFee: true,
        serviceFee: true,
        discount: true,
        total: true,
        paymentStatus: true,
        paymentMethod: true,
        placedAt: true,
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
            notes: true,
            status: true,
            modifiers: { select: { nameSnapshot: true, priceDelta: true } },
          },
          orderBy: { nameSnapshot: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /// Public tracking: the order number alone is guessable, so the phone number
  /// used at checkout has to match before anything is returned.
  async track(orderNumber: string, phone: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      include: {
        items: { select: { nameSnapshot: true, quantity: true, status: true } },
        events: {
          orderBy: { createdAt: 'asc' },
          select: { toStatus: true, createdAt: true },
        },
      },
    });

    const normalise = (value: string) => value.replace(/\D/g, '').slice(-10);
    if (!order || normalise(order.customerPhone) !== normalise(phone)) {
      throw new NotFoundException(
        'No order matches that number and phone combination',
      );
    }

    return order;
  }

  // ------------------------------------------------------------ transitions

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    actorId: string | null,
  ) {
    const current = await this.prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Order not found');

    if (current.status === dto.status) return this.findOne(id);

    if (!ALLOWED_TRANSITIONS[current.status].includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move an order from ${current.status} to ${dto.status}`,
      );
    }

    const now = new Date();
    const timestamps: Prisma.OrderUncheckedUpdateInput = {};
    if (dto.status === OrderStatus.CONFIRMED) timestamps.confirmedAt = now;
    if (dto.status === OrderStatus.PREPARING) timestamps.startedAt = now;
    if (dto.status === OrderStatus.READY) timestamps.readyAt = now;
    if (dto.status === OrderStatus.COMPLETED) timestamps.completedAt = now;

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...timestamps,
        ...(actorId && !current.claimedById ? { claimedById: actorId } : {}),
        // Marking the whole ticket ready implies every line is plated.
        ...(dto.status === OrderStatus.READY
          ? {
              items: {
                updateMany: {
                  where: { status: { not: OrderItemStatus.CANCELLED } },
                  data: { status: OrderItemStatus.READY },
                },
              },
            }
          : {}),
        events: {
          create: {
            actorId,
            fromStatus: current.status,
            toStatus: dto.status,
            note: dto.note,
          },
        },
      },
      include: orderInclude,
    });

    this.gateway.emitOrderUpdated(order, ORDER_EVENTS.statusChanged);

    // Not awaited: a push that fails must not fail the bump that caused it.
    void this.push.notifyOrderStatus(order.id, order.orderNumber, dto.status);
    return order;
  }

  async cancel(id: string, dto: CancelOrderDto, actorId: string | null) {
    const current = await this.prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Order not found');

    if (!ALLOWED_TRANSITIONS[current.status].includes(OrderStatus.CANCELLED)) {
      throw new ForbiddenException(
        `A ${current.status.toLowerCase()} order cannot be cancelled`,
      );
    }

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
        items: { updateMany: { where: {}, data: { status: OrderItemStatus.CANCELLED } } },
        events: {
          create: {
            actorId,
            fromStatus: current.status,
            toStatus: OrderStatus.CANCELLED,
            note: dto.reason,
          },
        },
      },
      include: orderInclude,
    });

    this.gateway.emitOrderUpdated(order, ORDER_EVENTS.cancelled);
    void this.push.notifyOrderStatus(
      order.id,
      order.orderNumber,
      OrderStatus.CANCELLED,
    );
    return order;
  }

  async updateItemStatus(
    orderId: string,
    itemId: string,
    status: OrderItemStatus,
  ) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { status },
    });

    const order = await this.findOne(orderId);
    this.gateway.emitOrderUpdated(order, ORDER_EVENTS.itemStatusChanged);
    return order;
  }

  async updatePayment(id: string, dto: UpdatePaymentDto, actorId: string | null) {
    const current = await this.prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Order not found');

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus: dto.paymentStatus,
        paymentMethod: dto.paymentMethod,
        paymentRef: dto.paymentRef,
        // A payment change leaves the fulfilment status alone; the event row
        // records it against wherever the ticket currently sits.
        events: {
          create: {
            actorId,
            fromStatus: current.status,
            toStatus: current.status,
            note: `Payment marked ${dto.paymentStatus}`,
          },
        },
      },
      include: orderInclude,
    });

    this.gateway.emitOrderUpdated(order);
    return order;
  }

  async claim(id: string, actorId: string) {
    const order = await this.prisma.order.update({
      where: { id },
      data: { claimedById: actorId },
      include: orderInclude,
    });
    this.gateway.emitOrderUpdated(order);
    return order;
  }
}
