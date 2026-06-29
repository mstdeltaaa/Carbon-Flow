import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";

import { normalizePermissionMap } from "../access-control/permissions";

@Injectable()
export class CompanyMembershipGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      accessToken?: string;
      company?: {
        id: string;
        permissions: Record<string, boolean>;
        role: string;
      };
      headers: Record<string, string | string[] | undefined>;
      user?: { id: string; email?: string };
    }>();
    const companyHeader = request.headers["x-company-id"];
    const companyId = Array.isArray(companyHeader)
      ? companyHeader[0]
      : companyHeader;

    if (!request.user || !request.accessToken) {
      throw new UnauthorizedException("Autenticacao obrigatoria.");
    }

    if (!companyId) {
      throw new BadRequestException("Cabecalho x-company-id obrigatorio.");
    }

    const supabaseUrl =
      this.config.get<string>("SUPABASE_URL") ??
      this.config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey =
      this.config.get<string>("SUPABASE_ANON_KEY") ??
      this.config.get<string>("SUPABASE_PUBLISHABLE_KEY") ??
      this.config.get<string>("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException("Supabase nao configurado.");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${request.accessToken}`
        }
      }
    });

    const { data, error } = await supabase
      .from("company_users")
      .select("role, permissions")
      .eq("company_id", companyId)
      .eq("user_id", request.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) {
      throw new ForbiddenException("Usuario sem acesso a esta empresa.");
    }

    request.company = {
      id: companyId,
      permissions: normalizePermissionMap(data.permissions),
      role: String(data.role)
    };

    return true;
  }
}
