import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [SupabaseModule],
  controllers: [AssistantController],
  providers: [AssistantService]
})
export class AssistantModule {}
