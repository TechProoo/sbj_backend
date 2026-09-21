import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  kicker!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  headline!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaHref?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  kicker?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaHref?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
