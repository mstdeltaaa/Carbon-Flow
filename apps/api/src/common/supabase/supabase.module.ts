import { Module } from "@nestjs/common";

import { SupabaseClientFactory } from "./supabase-client.factory";

@Module({
  providers: [SupabaseClientFactory],
  exports: [SupabaseClientFactory]
})
export class SupabaseModule {}

