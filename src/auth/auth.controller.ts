import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { StaffProfile, StaffRole } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthService } from './auth.service';
import { CreateStaffDto } from './dto/create-staff.dto';

class UpdateRoleDto {
  @IsEnum(StaffRole)
  role!: StaffRole;
}

class UpdateActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /// Called by both apps right after Supabase sign-in to learn who the token
  /// belongs to and whether they may open the kitchen dashboard.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('staff')
  @Roles(StaffRole.MANAGER)
  listStaff(): Promise<StaffProfile[]> {
    return this.auth.listStaff();
  }

  @Post('staff')
  @Roles(StaffRole.MANAGER)
  createStaff(@Body() dto: CreateStaffDto): Promise<StaffProfile> {
    return this.auth.createStaff(dto);
  }

  @Patch('staff/:id/role')
  @Roles(StaffRole.ADMIN)
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<StaffProfile> {
    return this.auth.setStaffRole(id, dto.role);
  }

  @Patch('staff/:id/active')
  @Roles(StaffRole.MANAGER)
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActiveDto,
  ): Promise<StaffProfile> {
    return this.auth.setStaffActive(id, dto.isActive);
  }
}
