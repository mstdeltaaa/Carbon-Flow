import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AccessToken } from "../../common/decorators/access-token.decorator";
import { CompanyPermissions } from "../../common/decorators/company-permissions.decorator";
import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import {
  CurrentCompany,
  type CurrentCompany as CurrentCompanyPayload
} from "../../common/decorators/current-company.decorator";
import {
  CurrentUser,
  type CurrentUser as CurrentUserPayload
} from "../../common/decorators/current-user.decorator";
import { CompanyMembershipGuard } from "../../common/guards/company-membership.guard";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { SalesService } from "./sales.service";

@ApiTags("sales")
@ApiBearerAuth()
@Controller("sales")
@CompanyRoles("admin", "employee")
@CompanyPermissions("sales")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.salesService.findAll(accessToken, company.id);
  }

  @Get(":id")
  findOne(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Param("id") saleId: string
  ) {
    return this.salesService.findOne(accessToken, company.id, saleId);
  }

  @Post()
  create(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSaleDto
  ) {
    return this.salesService.create(accessToken, company.id, user.id, dto);
  }

  @Post("from-budget/:budgetId")
  convertBudget(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("budgetId") budgetId: string
  ) {
    return this.salesService.convertBudget(
      accessToken,
      company.id,
      user.id,
      budgetId
    );
  }

  @Post(":id/cancel")
  cancel(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") saleId: string
  ) {
    return this.salesService.cancel(accessToken, company.id, user.id, saleId);
  }
}
