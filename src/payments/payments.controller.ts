import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { InitializePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

/// Every customer-facing route here is public by necessity — guest checkout
/// has no account to authenticate. Each is instead tied to something the
/// caller must already know: an order id they just created, or a reference
/// Paystack issued them.
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /// Lets the storefront hide the "pay now" option entirely when no keys are
  /// configured, rather than offering a button that fails.
  @Get('config')
  @Public()
  config() {
    return this.payments.getPublicConfig();
  }

  /// Opens a Paystack transaction for an existing order and returns the URL
  /// to send the customer to.
  @Post('initialize')
  @Public()
  initialize(@Body() dto: InitializePaymentDto) {
    return this.payments.initialize(dto);
  }

  /// The redirect landing calls this. Idempotent, so refreshing the page or
  /// racing the webhook changes nothing.
  @Get('verify/:reference')
  @Public()
  verify(@Param('reference') reference: string) {
    return this.payments.verify(reference);
  }

  /// Paystack -> us. Authenticated by the HMAC signature over the raw body,
  /// which is why this route needs `rawBody` enabled in main.ts.
  @Post('webhook')
  @Public()
  @HttpCode(200)
  webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-paystack-signature') signature?: string,
  ) {
    return this.payments.handleWebhook(request.rawBody, signature);
  }

  /// Staff view of the attempts behind one order, for answering "he says he
  /// paid" at the counter.
  @Get('order/:orderId')
  @Roles(StaffRole.CASHIER, StaffRole.MANAGER)
  forOrder(@Param('orderId') orderId: string) {
    return this.payments.listForOrder(orderId);
  }
}
