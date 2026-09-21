import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Promotion, StaffRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /// The storefront carousel — live slides only.
  @Get()
  @Public()
  live(): Promise<Promotion[]> {
    return this.promotions.getLive();
  }

  /// Staff view, including expired and switched-off slides.
  @Get('all')
  @Roles(StaffRole.MANAGER)
  all(): Promise<Promotion[]> {
    return this.promotions.listAll();
  }

  @Post()
  @Roles(StaffRole.MANAGER)
  create(@Body() dto: CreatePromotionDto): Promise<Promotion> {
    return this.promotions.create(dto);
  }

  @Patch(':id')
  @Roles(StaffRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
  ): Promise<Promotion> {
    return this.promotions.update(id, dto);
  }

  @Delete(':id')
  @Roles(StaffRole.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<Promotion> {
    return this.promotions.remove(id);
  }
}
