import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { CreateFinancialTransactionDto } from "./dto/create-financial-transaction.dto";
import { FinanceService } from "./finance.service";

@ApiTags("finance")
@ApiBearerAuth()
@Controller("finance")
@CompanyRoles("admin", "employee")
@CompanyPermissions("finance")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get("summary")
  getSummary(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.financeService.getSummary(accessToken, company.id, from, to);
  }

  @Get()
  findAll(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.financeService.findAll(accessToken, company.id, from, to);
  }

  @Post()
  create(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateFinancialTransactionDto
  ) {
    return this.financeService.createManual(
      accessToken,
      company.id,
      user.id,
      dto
    );
  }

  @Patch(":id")
  update(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") transactionId: string,
    @Body() dto: CreateFinancialTransactionDto
  ) {
    return this.financeService.updateManual(
      accessToken,
      company.id,
      user.id,
      transactionId,
      dto
    );
  }

  @Post(":id/mark-paid")
  markPaid(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") transactionId: string
  ) {
    return this.financeService.markManualAsPaid(
      accessToken,
      company.id,
      user.id,
      transactionId
    );
  }

  @Post(":id/cancel")
  cancel(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") transactionId: string
  ) {
    return this.financeService.cancelManual(
      accessToken,
      company.id,
      user.id,
      transactionId
    );
  }
}
