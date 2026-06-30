import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [SupabaseModule, AuditModule],
  controllers: [StockController],
  providers: [StockService]
})
export class StockModule {}
