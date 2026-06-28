import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [SupabaseModule, AuditModule, SubscriptionsModule],
  controllers: [SalesController],
  providers: [SalesService]
})
export class SalesModule {}
