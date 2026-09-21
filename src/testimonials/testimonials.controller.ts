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
import { Testimonial, StaffRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';
import { TestimonialsService, TestimonialFeed } from './testimonials.service';

@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  /// Published reviews plus the computed rating summary.
  @Get()
  @Public()
  feed(): Promise<TestimonialFeed> {
    return this.testimonials.getFeed();
  }

  @Get('all')
  @Roles(StaffRole.MANAGER)
  all(): Promise<Testimonial[]> {
    return this.testimonials.listAll();
  }

  @Post()
  @Roles(StaffRole.MANAGER)
  create(@Body() dto: CreateTestimonialDto): Promise<Testimonial> {
    return this.testimonials.create(dto);
  }

  @Patch(':id')
  @Roles(StaffRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestimonialDto,
  ): Promise<Testimonial> {
    return this.testimonials.update(id, dto);
  }

  @Delete(':id')
  @Roles(StaffRole.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<Testimonial> {
    return this.testimonials.remove(id);
  }
}
