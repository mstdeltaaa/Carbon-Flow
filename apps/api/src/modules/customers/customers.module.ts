import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [SupabaseModule, SubscriptionsModule],
  controllers: [CustomersController],
  providers: [CustomersService]
})
export class CustomersModule {}
