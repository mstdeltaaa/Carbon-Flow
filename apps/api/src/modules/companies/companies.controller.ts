import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
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
import { CompaniesService } from "./companies.service";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import {
  CurrentUser,
  type CurrentUser as CurrentUserPayload
} from "../../common/decorators/current-user.decorator";

@ApiTags("companies")
@ApiBearerAuth()
@Controller("companies")
@CompanyRoles("admin")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get("document-profile")
  @CompanyRoles("admin", "employee", "seller")
  getDocumentProfile(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.companiesService.getDocumentProfile(accessToken, company.id);
  }

  @Get("settings")
  getSettings(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.companiesService.getSettings(accessToken, company.id);
  }

  @Patch("settings")
  update(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateCompanyDto
  ) {
    return this.companiesService.update(
      accessToken,
      company.id,
      company.role,
      user.id,
      dto
    );
  }

  @Post("members/invite")
  inviteMember(
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: InviteMemberDto
  ) {
    return this.companiesService.inviteMember(
      company.id,
      company.role,
      user.id,
      dto
    );
  }

  @Patch("members/:memberId")
  updateMember(
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("memberId") memberId: string,
    @Body() dto: UpdateMemberDto
  ) {
    return this.companiesService.updateMember(
      company.id,
      company.role,
      user.id,
      memberId,
      dto
    );
  }

  @Post("members/:memberId/resend-access")
  resendMemberAccess(
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Param("memberId") memberId: string
  ) {
    return this.companiesService.resendMemberAccess(
      company.id,
      company.role,
      user.id,
      memberId
    );
  }
}
