import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SubscribeDto, UnsubscribeDto } from './dto/subscribe.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /// The browser needs the VAPID public key before it can subscribe. Asked
  /// rather than hardcoded, so a server without keys reports itself as off.
  @Get('key')
  @Public()
  key() {
    return this.push.getPublicKey();
  }

  /// Public: checkout is guest-only, so the order id is the only identity a
  /// customer has. Knowing an order's uuid is what proves they placed it.
  @Post('subscribe')
  @Public()
  subscribe(@Body() dto: SubscribeDto) {
    return this.push.subscribe(dto);
  }

  @Post('unsubscribe')
  @Public()
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(dto.endpoint);
  }
}
