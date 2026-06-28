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
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

@ApiTags("products")
@ApiBearerAuth()
@Controller("products")
@UseGuards(SupabaseAuthGuard, CompanyMembershipGuard, CompanyRoleGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @CompanyRoles("admin", "employee", "seller")
  findAll(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload
  ) {
    return this.productsService.findAll(accessToken, company.id, company.role);
  }

  @Post()
  @CompanyRoles("admin", "employee")
  create(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateProductDto
  ) {
    return this.productsService.create(accessToken, company.id, user.id, dto);
  }

  @Patch(":id")
  @CompanyRoles("admin", "employee")
  update(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Param("id") productId: string,
    @Body() dto: UpdateProductDto
  ) {
    return this.productsService.update(accessToken, company.id, productId, dto);
  }

  @Delete(":id")
  @CompanyRoles("admin", "employee")
  deactivate(
    @AccessToken() accessToken: string,
    @CurrentCompany() company: CurrentCompanyPayload,
    @Param("id") productId: string
  ) {
    return this.productsService.deactivate(accessToken, company.id, productId);
  }
}
