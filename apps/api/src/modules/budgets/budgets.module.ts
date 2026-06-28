import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { BudgetsController } from "./budgets.controller";
import { BudgetsService } from "./budgets.service";

@Module({
  imports: [SupabaseModule, AuditModule, SubscriptionsModule],
  controllers: [BudgetsController],
  providers: [BudgetsService]
})
export class BudgetsModule {}
