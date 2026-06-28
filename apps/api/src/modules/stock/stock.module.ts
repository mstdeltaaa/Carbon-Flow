import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [SupabaseModule],
  controllers: [StockController],
  providers: [StockService]
})
export class StockModule {}
