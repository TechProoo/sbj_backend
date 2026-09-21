import { StaffRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;

  @IsOptional()
  @IsString()
  phone?: string;
}
