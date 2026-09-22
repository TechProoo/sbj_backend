import { IsString, IsUUID, MinLength } from 'class-validator';

export class SubscribeDto {
  /// The push service URL the browser handed us.
  @IsString()
  @MinLength(10)
  endpoint!: string;

  @IsString()
  @MinLength(10)
  p256dh!: string;

  @IsString()
  @MinLength(4)
  auth!: string;

  /// Which order this device wants to hear about.
  @IsUUID()
  orderId!: string;
}

export class UnsubscribeDto {
  @IsString()
  @MinLength(10)
  endpoint!: string;
}
