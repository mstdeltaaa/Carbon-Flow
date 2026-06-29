import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

export class CreateFinancialTransactionDto {
  @IsIn(["income", "expense"])
  type!: "income" | "expense";

  @IsOptional()
  @IsIn(["pending", "paid"])
  status?: "pending" | "paid";

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
