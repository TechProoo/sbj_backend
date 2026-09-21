import { OrderType, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @IsUUID()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  /// Modifier ids chosen for this line; validated against the item's own
  /// groups server-side, never trusted for pricing.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  modifierIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class DeliveryAddressDto {
  @IsString()
  @MinLength(3)
  line1!: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  landmark?: string;
}

export class CreateOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customerName!: string;

  /// Nigerian mobile numbers, local (0803...) or international (+23480...).
  @Matches(/^(\+?234|0)[789][01]\d{8}$/, {
    message: 'Enter a valid Nigerian phone number',
  })
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsEnum(OrderType)
  type!: OrderType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  address?: DeliveryAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  tableNumber?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
