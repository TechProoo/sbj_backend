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
import { FeedKind, StaffRole } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FeedService } from './feed.service';

/// What multer hands back. Typed here rather than pulling in @types/multer
/// for one shape.
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  /// The customer-facing feed.
  @Get()
  @Public()
  list(@Query('limit') limit?: string) {
    return this.feed.list(limit ? Number(limit) : undefined);
  }

  /// Everything, drafts included, for whoever is posting.
  @Get('all')
  @Roles(StaffRole.ADMIN, StaffRole.MANAGER)
  listAll() {
    return this.feed.listAll();
  }

  /*
   * A new post: one image plus a caption, sent as multipart form data.
   *
   * The file is held in memory rather than written to disk — it goes straight
   * back out to storage, and the API may be running somewhere with no durable
   * filesystem at all.
   */
  @Post()
  @Roles(StaffRole.ADMIN, StaffRole.MANAGER)
  @UseInterceptors(FileInterceptor('image'))
  create(
    @UploadedFile() image: UploadedImage | undefined,
    @Body('caption') caption: string,
    @Body('kind') kind: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = kind === 'PROMO' ? FeedKind.PROMO : FeedKind.GIST;
    return this.feed.create(image, caption ?? '', parsed, user.id);
  }

  @Patch(':id/published')
  @Roles(StaffRole.ADMIN, StaffRole.MANAGER)
  setPublished(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isPublished') isPublished: boolean,
  ) {
    return this.feed.setPublished(id, isPublished !== false);
  }

  @Delete(':id')
  @Roles(StaffRole.ADMIN, StaffRole.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.feed.remove(id);
  }
}
