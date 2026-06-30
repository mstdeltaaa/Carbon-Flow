import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [SupabaseModule, AuditModule, SubscriptionsModule],
  controllers: [CustomersController],
  providers: [CustomersService]
})
export class CustomersModule {}
