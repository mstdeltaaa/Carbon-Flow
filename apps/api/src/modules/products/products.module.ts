import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [SupabaseModule, AuditModule, SubscriptionsModule],
  controllers: [ProductsController],
  providers: [ProductsService]
})
export class ProductsModule {}
