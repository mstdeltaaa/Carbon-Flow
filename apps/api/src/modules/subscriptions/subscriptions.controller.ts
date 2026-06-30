import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import {
  CurrentCompany,
  type CurrentCompany as CurrentCompanyPayload,
} from "../../common/decorators/current-company.decorator";
import { CompanyMembershipGuard } from "../../common/guards/company-membership.guard";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@ApiBearerAuth()
@Controller("subscriptions")
@CompanyRoles("admin", "employee", "seller")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("overview")
  getOverview(@CurrentCompany() company: CurrentCompanyPayload) {
    return this.subscriptionsService.getOverview(company.id);
  }

  @Post("pro-trial")
  @CompanyRoles("admin")
  startProTrial(@CurrentCompany() company: CurrentCompanyPayload) {
    return this.subscriptionsService.startProTrial(company.id);
  }
}
