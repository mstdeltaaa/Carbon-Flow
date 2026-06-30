import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseClientFactory {
  constructor(private readonly config: ConfigService) {}

  createForUser(accessToken: string) {
    const supabaseUrl =
      this.config.get<string>("SUPABASE_URL") ??
      this.config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey =
      this.config.get<string>("SUPABASE_ANON_KEY") ??
      this.config.get<string>("SUPABASE_PUBLISHABLE_KEY") ??
      this.config.get<string>("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException("Supabase não configurado.");
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });
  }

  createAdmin() {
    const supabaseUrl =
      this.config.get<string>("SUPABASE_URL") ??
      this.config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseSecretKey =
      this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ??
      this.config.get<string>("SUPABASE_SECRET_KEY");

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new UnauthorizedException("Supabase administrativo não configurado.");
    }

    return createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    });
  }
}
