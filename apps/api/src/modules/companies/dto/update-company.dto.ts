import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { Type } from "class-transformer";

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  document?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagram?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  budgetValidityDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  defaultMarginPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  commercialTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  paymentInstructions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentFooter?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string | null;
}
