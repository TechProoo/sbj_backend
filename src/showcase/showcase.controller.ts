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
import { Showcase, StaffRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateShowcaseDto, UpdateShowcaseDto } from './dto/showcase.dto';
import { ShowcaseService } from './showcase.service';

@Controller('showcase')
export class ShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Get()
  @Public()
  published(): Promise<Showcase[]> {
    return this.showcase.getPublished();
  }

  @Get('all')
  @Roles(StaffRole.MANAGER)
  all(): Promise<Showcase[]> {
    return this.showcase.listAll();
  }

  @Post()
  @Roles(StaffRole.MANAGER)
  create(@Body() dto: CreateShowcaseDto): Promise<Showcase> {
    return this.showcase.create(dto);
  }

  @Patch(':id')
  @Roles(StaffRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShowcaseDto,
  ): Promise<Showcase> {
    return this.showcase.update(id, dto);
  }

  @Delete(':id')
  @Roles(StaffRole.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<Showcase> {
    return this.showcase.remove(id);
  }
}
