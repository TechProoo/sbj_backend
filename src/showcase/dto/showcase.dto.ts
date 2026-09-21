import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateShowcaseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  place?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  blurb?: string;

  @IsString()
  @MinLength(1)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaHref?: string;

  @IsOptional()
  @IsISO8601()
  happenedAt?: string;

  @IsOptional()
  @IsInt()
  position?: number;
}

export class UpdateShowcaseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  place?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  blurb?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaHref?: string;

  @IsOptional()
  @IsISO8601()
  happenedAt?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
