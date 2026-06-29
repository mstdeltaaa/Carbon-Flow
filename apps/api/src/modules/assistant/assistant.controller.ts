import { Body, Controller, Post, UseGuards } from "@nestjs/common";
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
import { AssistantService } from "./assistant.service";
import { AssistantChatDto } from "./dto/assistant-chat.dto";

@ApiTags("assistant")
@ApiBearerAuth()
@Controller("assistant")
@CompanyRoles("admin", "employee", "seller")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("chat")
  chat(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AssistantChatDto
  ) {
    return this.assistantService.chat(accessToken, company, user, dto);
  }
}
