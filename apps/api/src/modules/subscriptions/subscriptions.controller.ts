import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import {
  CurrentCompany,
  type CurrentCompany as CurrentCompanyPayload,
} from "../../common/decorators/current-company.decorator";
import {
  CurrentUser,
  type CurrentUser as CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
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

  @Post("checkout/pro")
  @CompanyRoles("admin")
  createProCheckout(
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.subscriptionsService.createProCheckout(company.id, user?.email);
  }
}
