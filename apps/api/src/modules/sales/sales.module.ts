import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [SupabaseModule, AuditModule, FinanceModule, SubscriptionsModule],
  controllers: [SalesController],
  providers: [SalesService]
})
export class SalesModule {}
