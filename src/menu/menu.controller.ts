import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StaffRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  MenuQueryDto,
  SetAvailabilityDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';
import { MenuService } from './menu.service';

/// What multer hands back; typed here rather than pulling in @types/multer.
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  /// One call that renders the entire storefront.
  @Get()
  @Public()
  storefront() {
    return this.menu.getStorefrontMenu();
  }

  @Get('categories')
  @Public()
  categories() {
    return this.menu.listCategories();
  }

  @Get('items')
  @Public()
  items(@Query() query: MenuQueryDto) {
    return this.menu.listItems(query);
  }

  @Get('items/:slug')
  @Public()
  item(@Param('slug') slug: string) {
    return this.menu.getItemBySlug(slug);
  }

  @Post('categories')
  @Roles(StaffRole.MANAGER)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menu.createCategory(dto);
  }

  @Patch('categories/:id')
  @Roles(StaffRole.MANAGER)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.menu.updateCategory(id, dto);
  }

  /// A dish photo. Returns the public URL to put in the item's `imageUrl`.
  @Post('items/image')
  @Roles(StaffRole.KITCHEN, StaffRole.MANAGER)
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(@UploadedFile() image: UploadedImage | undefined) {
    return this.menu.uploadImage(image);
  }

  @Post('items')
  @Roles(StaffRole.KITCHEN, StaffRole.MANAGER)
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(dto);
  }

  @Patch('items/:id')
  @Roles(StaffRole.KITCHEN, StaffRole.MANAGER)
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(id, dto);
  }

  /// The kitchen needs this one mid-service, so KITCHEN can call it too.
  @Patch('items/:id/availability')
  @Roles(StaffRole.KITCHEN, StaffRole.MANAGER)
  setAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.menu.setAvailability(id, dto.isAvailable);
  }

  @Delete('items/:id')
  @Roles(StaffRole.MANAGER)
  deleteItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.menu.deleteItem(id);
  }
}
