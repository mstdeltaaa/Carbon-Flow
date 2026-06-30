import { createBrowserClient } from "@supabase/ssr";

import { env, hasSupabaseEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (!hasSupabaseEnv) {
    throw new Error("Supabase environment variables are not configured.");
  }

  browserClient ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);

  return browserClient;
}
