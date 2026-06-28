import { IsEmail, IsIn } from "class-validator";

const companyRoles = ["admin", "employee", "seller"] as const;

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(companyRoles)
  role!: (typeof companyRoles)[number];
}
