import { OrderStatus, OrderType, PaymentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()) : value;

export class QueryOrdersDto {
  @IsOptional()
  @Transform(toArray)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class TrackOrderDto {
  @IsString()
  orderNumber!: string;

  @IsString()
  phone!: string;
}

export class OrderIdParamDto {
  @IsUUID()
  id!: string;
}
