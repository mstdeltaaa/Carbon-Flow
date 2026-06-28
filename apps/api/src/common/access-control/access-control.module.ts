import { Global, Module } from "@nestjs/common";

import { CompanyRoleGuard } from "../guards/company-role.guard";

@Global()
@Module({
  providers: [CompanyRoleGuard],
  exports: [CompanyRoleGuard]
})
export class AccessControlModule {}
