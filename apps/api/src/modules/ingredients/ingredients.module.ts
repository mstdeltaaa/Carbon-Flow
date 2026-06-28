import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { IngredientsController } from "./ingredients.controller";
import { IngredientsService } from "./ingredients.service";

@Module({
  imports: [SupabaseModule, SubscriptionsModule],
  controllers: [IngredientsController],
  providers: [IngredientsService]
})
export class IngredientsModule {}
