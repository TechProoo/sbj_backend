import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateCounterOrderDto } from './dto/create-counter-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto, TrackOrderDto } from './dto/query-orders.dto';
import {
  CancelOrderDto,
  UpdateItemStatusDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
} from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /// Guest checkout — no account required.
  @Post()
  @Public()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  /*
   * A ticket typed in by staff: the walk-in paying cash at the counter, or an
   * order phoned through. It lands on the board already accepted, because a
   * person accepted it.
   */
  @Post('manual')
  @Roles(StaffRole.KITCHEN, StaffRole.CASHIER, StaffRole.MANAGER)
  createManual(
    @Body() dto: CreateCounterOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.createManual(dto, user.id);
  }

  /// Customer-facing status lookup, gated on order number + phone.
  @Post('track')
  @Public()
  track(@Body() dto: TrackOrderDto) {
    return this.orders.track(dto.orderNumber, dto.phone);
  }

  /// The customer's own receipt, by the uuid checkout handed them. Public
  /// because guest checkout has no account — and needed by the page Paystack
  /// redirects back to, which has lost all its client-side state.
  @Get(':id/receipt')
  @Public()
  receipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.receipt(id);
  }

  @Get()
  @Roles(StaffRole.KITCHEN, StaffRole.CASHIER, StaffRole.MANAGER)
  findAll(@Query() query: QueryOrdersDto) {
    return this.orders.findAll(query);
  }

  @Get(':id')
  @Roles(StaffRole.KITCHEN, StaffRole.CASHIER, StaffRole.MANAGER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Patch(':id/status')
  @Roles(StaffRole.KITCHEN, StaffRole.CASHIER, StaffRole.MANAGER)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.updateStatus(id, dto, user.id);
  }

  @Patch(':id/cancel')
  @Roles(StaffRole.CASHIER, StaffRole.MANAGER)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.cancel(id, dto, user.id);
  }

  @Patch(':id/claim')
  @Roles(StaffRole.KITCHEN, StaffRole.MANAGER)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.claim(id, user.id);
  }

  @Patch(':id/items/:itemId/status')
  @Roles(StaffRole.KITCHEN, StaffRole.MANAGER)
  updateItemStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemStatusDto,
  ) {
    return this.orders.updateItemStatus(id, itemId, dto.status);
  }

  @Patch(':id/payment')
  @Roles(StaffRole.CASHIER, StaffRole.MANAGER)
  updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.updatePayment(id, dto, user.id);
  }
}
