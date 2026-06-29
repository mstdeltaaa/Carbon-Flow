import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
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
import { BudgetsService } from "./budgets.service";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { UpdateBudgetDto } from "./dto/update-budget.dto";

@ApiTags("budgets")
@ApiBearerAuth()
@Controller("budgets")
@CompanyRoles("admin", "employee", "seller")
@CompanyPermissions("budgets")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  findAll(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.budgetsService.findAll(accessToken, company.id);
  }

  @Get(":id")
  findOne(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Param("id") budgetId: string
  ) {
    return this.budgetsService.findOne(accessToken, company.id, budgetId);
  }

  @Post()
  create(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBudgetDto
  ) {
    return this.budgetsService.create(accessToken, company.id, user.id, dto);
  }

  @Patch(":id")
  update(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") budgetId: string,
    @Body() dto: UpdateBudgetDto
  ) {
    return this.budgetsService.update(
      accessToken,
      company.id,
      budgetId,
      user.id,
      dto
    );
  }

  @Delete(":id")
  remove(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") budgetId: string
  ) {
    return this.budgetsService.remove(
      accessToken,
      company.id,
      user.id,
      budgetId
    );
  }
}
