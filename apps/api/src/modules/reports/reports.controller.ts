import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AccessToken } from "../../common/decorators/access-token.decorator";
import { CompanyPermissions } from "../../common/decorators/company-permissions.decorator";
import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import {
  CurrentCompany,
  type CurrentCompany as CurrentCompanyPayload,
} from "../../common/decorators/current-company.decorator";
import { CompanyMembershipGuard } from "../../common/guards/company-membership.guard";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
@CompanyRoles("admin", "employee")
@CompanyPermissions("dashboard")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  getOverview(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.getOverview(accessToken, company.id, from, to);
  }
}
