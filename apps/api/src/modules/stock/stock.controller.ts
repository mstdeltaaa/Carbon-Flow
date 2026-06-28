import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AccessToken } from "../../common/decorators/access-token.decorator";
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
import { CreateStockMovementDto } from "./dto/create-stock-movement.dto";
import { StockService } from "./stock.service";

@ApiTags("stock")
@ApiBearerAuth()
@Controller("stock")
@CompanyRoles("admin", "employee")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  findItems(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.stockService.findItems(accessToken, company.id);
  }

  @Get("movements")
  findMovements(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.stockService.findMovements(accessToken, company.id);
  }

  @Post("movements")
  createMovement(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateStockMovementDto
  ) {
    return this.stockService.createMovement(
      accessToken,
      company.id,
      user.id,
      dto
    );
  }
}
