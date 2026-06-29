import { SetMetadata } from "@nestjs/common";

import { type CompanyPermission } from "../access-control/permissions";

export const COMPANY_PERMISSIONS_KEY = "company_permissions";

export function CompanyPermissions(...permissions: CompanyPermission[]) {
  return SetMetadata(COMPANY_PERMISSIONS_KEY, permissions);
}
