import { OrderChannel, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OrderItemInputDto, DeliveryAddressDto } from './create-order.dto';
import { OrderType } from '@prisma/client';

/*
 * An order typed in by staff: a walk-in paying cash, or one phoned through.
 *
 * It is deliberately looser than guest checkout. Somebody standing at the
 * counter has already been served — refusing the ticket because they would
 * not give a phone number helps nobody, and the online minimum has no meaning
 * for a single bottle of malt bought at the till.
 */
export class CreateCounterOrderDto {
  /// Defaults to "Walk-in" — a queue does not stop for a name.
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customerName?: string;

  @IsOptional()
  @Matches(/^(\+?234|0)[789][01]\d{8}$/, {
    message: 'Enter a valid Nigerian phone number',
  })
  customerPhone?: string;

  @IsEnum(OrderType)
  type!: OrderType;

  /// WALK_IN for the counter, PHONE for an order called in.
  @IsOptional()
  @IsEnum(OrderChannel)
  channel?: OrderChannel;

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

  /// True when the money is already in the till, which is the normal case for
  /// cash at the counter.
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /// Set by the kitchen screen when it took the order with no connection.
  /// Sending the same value twice returns the first order instead of making a
  /// second, which is what makes a retried upload safe.
  @IsOptional()
  @IsUUID()
  clientRef?: string;

  /// The OFF-007 style number the offline screen printed on the slip.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  offlineRef?: string;

  /// When the order was actually taken, for an order that sat on the device
  /// until the connection came back.
  @IsOptional()
  @IsDateString()
  placedAt?: string;
}
