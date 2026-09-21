import { Controller, Get } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { KitchenService } from './kitchen.service';

@Controller('kitchen')
@Roles(StaffRole.KITCHEN, StaffRole.CASHIER, StaffRole.MANAGER)
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('board')
  board() {
    return this.kitchen.getBoard();
  }

  @Get('stats')
  stats() {
    return this.kitchen.getStats();
  }

  @Get('sold-out')
  soldOut() {
    return this.kitchen.listSoldOutItems();
  }
}
