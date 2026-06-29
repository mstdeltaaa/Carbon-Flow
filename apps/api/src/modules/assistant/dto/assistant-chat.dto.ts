import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class AssistantChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  activeItem?: string;

  @IsOptional()
  @IsIn(["general", "pricing", "sales", "stock"])
  mode?: "general" | "pricing" | "sales" | "stock";

  @IsString()
  @MaxLength(1200)
  prompt!: string;
}
