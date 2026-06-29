import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AccessToken } from "../../common/decorators/access-token.decorator";
import { CompanyPermissions } from "../../common/decorators/company-permissions.decorator";
import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import {
  CurrentCompany,
  type CurrentCompany as CurrentCompanyPayload
} from "../../common/decorators/current-company.decorator";
import { CompanyMembershipGuard } from "../../common/guards/company-membership.guard";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
@CompanyRoles("admin", "employee")
@CompanyPermissions("dashboard")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.dashboardService.getSummary(accessToken, company.id);
  }
}
