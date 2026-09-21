import { Controller, Get, Query } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

/// The owner's view of the restaurant. Managers can read it too; nobody below
/// that sees revenue.
@Controller('admin')
@Roles(StaffRole.ADMIN, StaffRole.MANAGER)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /// `?day=YYYY-MM-DD` reports on that service day; omitted, it reports today.
  @Get('overview')
  overview(@Query('day') day?: string) {
    return this.admin.getOverview(day);
  }
}
