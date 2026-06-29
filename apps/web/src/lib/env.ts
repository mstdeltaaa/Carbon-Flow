export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  assistantAiEnabled: process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED === "true",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ""
};

export const hasSupabaseEnv =
  env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
