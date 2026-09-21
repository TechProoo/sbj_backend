import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitializePaymentDto {
  @IsUUID()
  orderId!: string;

  /// Paystack requires an email to send the receipt to. Checkout collects it
  /// optionally, so a customer paying online who skipped it supplies it here
  /// rather than being sent back to re-enter the whole form.
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class VerifyPaymentDto {
  @IsString()
  @MaxLength(100)
  reference!: string;
}
