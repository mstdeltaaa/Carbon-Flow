import { BadRequestException, Injectable } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";

type AuditLogInput = {
  action: string;
  companyId: string;
  entityId?: string | null;
  entityType: string;
  metadata?: Record<string, unknown>;
  userId: string;
};

type AuditLogRow = {
  action: string;
  company_id: string | null;
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  id: string;
  metadata: Record<string, unknown>;
  user_id: string | null;
};

type AuditUserRow = {
  email: string | null;
  full_name: string | null;
  id: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly supabaseFactory: SupabaseClientFactory) {}

  async findAll(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("audit_logs")
      .select(
        "id, company_id, user_id, action, entity_type, entity_id, metadata, created_at"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new BadRequestException(
        error.message ?? "Nao foi possivel carregar o historico."
      );
    }

    const logs = (data ?? []) as AuditLogRow[];
    const userIds = [
      ...new Set(
        logs
          .map((log) => log.user_id)
          .filter((userId): userId is string => Boolean(userId))
      )
    ];
    let users: AuditUserRow[] = [];

    if (userIds.length > 0) {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);

      if (userError) {
        throw new BadRequestException(
          userError.message ?? "Nao foi possivel carregar os usuarios."
        );
      }

      users = (userData ?? []) as AuditUserRow[];
    }

    return logs.map((log) => {
      const user = users.find((current) => current.id === log.user_id);

      return {
        action: log.action,
        companyId: log.company_id,
        createdAt: log.created_at,
        entityId: log.entity_id,
        entityType: log.entity_type,
        id: log.id,
        metadata: log.metadata,
        user: user
          ? {
              email: user.email,
              fullName: user.full_name,
              id: user.id
            }
          : null,
        userId: log.user_id
      };
    });
  }

  async record(input: AuditLogInput) {
    try {
      const supabase = this.supabaseFactory.createAdmin();
      const { error } = await supabase.from("audit_logs").insert({
        action: input.action,
        company_id: input.companyId,
        entity_id: input.entityId ?? null,
        entity_type: input.entityType,
        metadata: input.metadata ?? {},
        user_id: input.userId
      });

      if (error) {
        console.warn("Nao foi possivel gravar auditoria.", error.message);
      }
    } catch (error) {
      console.warn(
        "Auditoria indisponivel.",
        error instanceof Error ? error.message : error
      );
    }
  }
}
