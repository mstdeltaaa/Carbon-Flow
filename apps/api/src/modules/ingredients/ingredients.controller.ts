import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
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
import { CreateIngredientDto } from "./dto/create-ingredient.dto";
import { UpdateIngredientDto } from "./dto/update-ingredient.dto";
import { IngredientsService } from "./ingredients.service";

@ApiTags("ingredients")
@ApiBearerAuth()
@Controller("ingredients")
@CompanyRoles("admin", "employee")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  findAll(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.ingredientsService.findAll(accessToken, company.id);
  }

  @Post()
  create(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateIngredientDto
  ) {
    return this.ingredientsService.create(accessToken, company.id, user.id, dto);
  }

  @Patch(":id")
  update(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Param("id") ingredientId: string,
    @Body() dto: UpdateIngredientDto
  ) {
    return this.ingredientsService.update(
      accessToken,
      company.id,
      ingredientId,
      dto
    );
  }

  @Delete(":id")
  deactivate(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Param("id") ingredientId: string
  ) {
    return this.ingredientsService.deactivate(
      accessToken,
      company.id,
      ingredientId
    );
  }
}
