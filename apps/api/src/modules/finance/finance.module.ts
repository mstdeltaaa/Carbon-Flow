import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  imports: [SupabaseModule, AuditModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService]
})
export class FinanceModule {}
