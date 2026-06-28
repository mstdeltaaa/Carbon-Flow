import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

import { BudgetItemDto } from "./budget-item.dto";

const budgetStatuses = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
  "converted",
  "cancelled"
] as const;

export class UpdateBudgetDto {
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsIn(budgetStatuses)
  status?: (typeof budgetStatuses)[number];

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetItemDto)
  items?: BudgetItemDto[];
}
