import { IsIn, IsOptional } from "class-validator";

const companyRoles = ["admin", "employee", "seller"] as const;
const companyUserStatuses = ["active", "invited", "disabled"] as const;

export class UpdateMemberDto {
  @IsOptional()
  @IsIn(companyRoles)
  role?: (typeof companyRoles)[number];

  @IsOptional()
  @IsIn(companyUserStatuses)
  status?: (typeof companyUserStatuses)[number];
}
