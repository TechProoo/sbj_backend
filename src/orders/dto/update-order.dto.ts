import {
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CancelOrderDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}

export class UpdateItemStatusDto {
  @IsEnum(OrderItemStatus)
  status!: OrderItemStatus;
}

export class UpdatePaymentDto {
  @IsEnum(PaymentStatus)
  paymentStatus!: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentRef?: string;
}
