import { Module } from "@nestjs/common";

import { CompanyMembershipGuard } from "../../common/guards/company-membership.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { AuthController } from "./auth.controller";

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, CompanyMembershipGuard],
  exports: [SupabaseAuthGuard, CompanyMembershipGuard]
})
export class AuthModule {}
