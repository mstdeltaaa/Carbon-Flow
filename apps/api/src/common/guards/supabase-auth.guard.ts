import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      accessToken?: string;
      headers: Record<string, string | string[] | undefined>;
      user?: { id: string; email?: string };
    }>();
    const authorizationHeader = request.headers.authorization;
    const authorization = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;

    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token de autenticação ausente.");
    }

    const accessToken = authorization.replace("Bearer ", "").trim();
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    });

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      throw new UnauthorizedException("Token de autenticação inválido.");
    }

    request.accessToken = accessToken;
    request.user = {
      id: user.id,
      email: user.email
    };

    return true;
  }
}
