import { Controller, ForbiddenException, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AccessToken } from "../../common/decorators/access-token.decorator";
import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import {
  CurrentCompany,
  type CurrentCompany as CurrentCompanyPayload
} from "../../common/decorators/current-company.decorator";
import { CompanyMembershipGuard } from "../../common/guards/company-membership.guard";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { AuditService } from "./audit.service";

@ApiTags("audit-logs")
@ApiBearerAuth()
@Controller("audit-logs")
@CompanyRoles("admin")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    if (company.role !== "admin") {
      throw new ForbiddenException("Apenas administradores podem ver o histórico.");
    }

    return this.auditService.findAll(accessToken, company.id);
  }
}
