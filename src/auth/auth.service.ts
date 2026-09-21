import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffProfile, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateStaffDto } from './dto/create-staff.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async getStaffProfile(userId: string): Promise<StaffProfile> {
    const profile = await this.prisma.staffProfile.findUnique({
      where: { id: userId },
    });
    if (!profile) {
      throw new NotFoundException('No staff profile for this account');
    }
    return profile;
  }

  listStaff(): Promise<StaffProfile[]> {
    return this.prisma.staffProfile.findMany({
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });
  }

  /// Creates the Supabase auth user and the mirroring profile row. If the
  /// profile insert fails the auth user is rolled back, otherwise the project
  /// accumulates logins that can never sign in to anything.
  async createStaff(dto: CreateStaffDto): Promise<StaffProfile> {
    const existing = await this.prisma.staffProfile.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('A staff member with that email exists');
    }

    const authUser = await this.supabase.createStaffUser(
      dto.email,
      dto.password,
      { full_name: dto.fullName, role: dto.role },
    );

    try {
      return await this.prisma.staffProfile.create({
        data: {
          id: authUser.id,
          email: authUser.email,
          fullName: dto.fullName,
          role: dto.role,
          phone: dto.phone,
        },
      });
    } catch (error) {
      await this.supabase.deleteAuthUser(authUser.id).catch(() => undefined);
      throw error;
    }
  }

  async setStaffRole(id: string, role: StaffRole): Promise<StaffProfile> {
    await this.getStaffProfile(id);
    return this.prisma.staffProfile.update({ where: { id }, data: { role } });
  }

  async setStaffActive(id: string, isActive: boolean): Promise<StaffProfile> {
    await this.getStaffProfile(id);
    return this.prisma.staffProfile.update({
      where: { id },
      data: { isActive },
    });
  }
}
