import { SetMetadata } from "@nestjs/common";

export type CompanyRole = "admin" | "employee" | "seller";

export const COMPANY_ROLES_KEY = "company_roles";

export function CompanyRoles(...roles: CompanyRole[]) {
  return SetMetadata(COMPANY_ROLES_KEY, roles);
}
