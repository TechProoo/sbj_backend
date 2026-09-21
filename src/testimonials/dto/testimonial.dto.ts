import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTestimonialDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  authorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authorRole?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(400)
  quote!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsInt()
  position?: number;
}

export class UpdateTestimonialDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authorRole?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(400)
  quote?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
