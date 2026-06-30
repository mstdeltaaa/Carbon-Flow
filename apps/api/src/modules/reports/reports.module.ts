import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  controllers: [ReportsController],
  imports: [SupabaseModule],
  providers: [ReportsService],
})
export class ReportsModule {}
