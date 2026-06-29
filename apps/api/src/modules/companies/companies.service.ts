import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  createDefaultEmployeePermissionMap,
  createEmptyPermissionMap,
  normalizePermissionMap,
  sanitizeEmployeePermissions,
  type CompanyPermissionMap
} from "../../common/access-control/permissions";
import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

type CompanyRole = "admin" | "employee" | "seller";
type CompanyUserStatus = "active" | "invited" | "disabled";

type CompanyRow = {
  document: string | null;
  email: string | null;
  id: string;
  logo_url?: string | null;
  name: string;
  phone: string | null;
  slug: string;
  updated_at: string;
};

type UserJoin = {
  email: string;
  full_name: string | null;
  id: string;
};

type CompanyUserRow = {
  created_at: string;
  id: string;
  permissions: Record<string, unknown> | null;
  role: CompanyRole;
  status: CompanyUserStatus;
  user_id: string;
  users?: UserJoin | UserJoin[] | null;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = normalizeText(value);

  return trimmed ? trimmed.toLowerCase() : null;
}

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new ForbiddenException(
      "Apenas administradores podem gerenciar usuarios."
    );
  }
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Nao foi possivel processar a empresa."
  );
}

function getJoinedUser(row: CompanyUserRow) {
  if (Array.isArray(row.users)) {
    return row.users[0] ?? null;
  }

  return row.users ?? null;
}

function mapCompany(row: CompanyRow) {
  return {
    document: row.document,
    email: row.email,
    id: row.id,
    logoUrl: row.logo_url ?? null,
    name: row.name,
    phone: row.phone,
    slug: row.slug,
    updatedAt: row.updated_at
  };
}

function mapMember(row: CompanyUserRow) {
  const user = getJoinedUser(row);

  return {
    id: row.id,
    createdAt: row.created_at,
    permissions: normalizePermissionMap(row.permissions),
    role: row.role,
    status: row.status,
    user: user
      ? {
          email: user.email,
          fullName: user.full_name,
          id: user.id
        }
      : null
  };
}

function getPermissionsForRole(
  role: CompanyRole,
  permissions?: Record<string, boolean>
): CompanyPermissionMap {
  if (role === "employee") {
    return permissions
      ? sanitizeEmployeePermissions(permissions)
      : createDefaultEmployeePermissionMap();
  }

  return createEmptyPermissionMap();
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  async getDocumentProfile(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug, document, email, phone, updated_at")
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Empresa nao encontrada.");
    }

    return {
      ...mapCompany(data as CompanyRow),
      logoUrl: await this.getCompanyLogoUrl(supabase, companyId)
    };
  }

  async getSettings(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const [companyResult, membersResult, subscription] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, slug, document, email, phone, updated_at")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("company_users")
        .select("id, user_id, role, status, permissions, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      this.subscriptionsService.getOverview(companyId)
    ]);

    if (companyResult.error) {
      throwDatabaseError(companyResult.error);
    }

    if (!companyResult.data) {
      throw new NotFoundException("Empresa nao encontrada.");
    }

    if (membersResult.error) {
      throwDatabaseError(membersResult.error);
    }

    const memberRows = (membersResult.data ?? []) as CompanyUserRow[];
    const userIds = [...new Set(memberRows.map((member) => member.user_id))];
    const usersById = new Map<string, UserJoin>();

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);

      if (usersError) {
        throwDatabaseError(usersError);
      }

      for (const user of (users ?? []) as UserJoin[]) {
        usersById.set(user.id, user);
      }
    }

    const companyLogoUrl = await this.getCompanyLogoUrl(supabase, companyId);

    return {
      company: {
        ...mapCompany(companyResult.data as CompanyRow),
        logoUrl: companyLogoUrl
      },
      members: memberRows.map((member) =>
        mapMember({
          ...member,
          users: usersById.get(member.user_id) ?? null
        })
      ),
      subscription
    };
  }

  async update(
    accessToken: string,
    companyId: string,
    role: string,
    dto: UpdateCompanyDto
  ) {
    if (role !== "admin") {
      throw new ForbiddenException(
        "Apenas administradores podem editar a empresa."
      );
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const payload: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.document !== undefined) {
      payload.document = normalizeText(dto.document);
    }

    if (dto.email !== undefined) {
      payload.email = normalizeEmail(dto.email);
    }

    if (dto.phone !== undefined) {
      payload.phone = normalizeText(dto.phone);
    }

    if (dto.logoUrl !== undefined) {
      payload.logo_url = normalizeText(dto.logoUrl);
    }

    const { data, error } = await supabase
      .from("companies")
      .update(payload)
      .eq("id", companyId)
      .select("id, name, slug, document, email, phone, updated_at")
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Empresa nao encontrada.");
    }

    return {
      ...mapCompany(data as CompanyRow),
      logoUrl:
        dto.logoUrl !== undefined
          ? normalizeText(dto.logoUrl)
          : await this.getCompanyLogoUrl(supabase, companyId)
    };
  }

  private async getCompanyLogoUrl(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string
  ) {
    const { data, error } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return ((data as Pick<CompanyRow, "logo_url"> | null)?.logo_url ?? null) as
      string | null;
  }

  async inviteMember(
    companyId: string,
    currentRole: string,
    invitedBy: string,
    dto: InviteMemberDto
  ) {
    requireAdmin(currentRole);

    const supabase = this.supabaseFactory.createAdmin();
    const email = normalizeEmail(dto.email);

    if (!email) {
      throw new BadRequestException("Email obrigatorio.");
    }

    let user = await this.findUserByEmail(email);
    let existingMember: CompanyUserRow | null = null;

    if (user) {
      existingMember = await this.getMemberByUserId(companyId, user.id);

      if (existingMember?.status === "active") {
        throw new ConflictException("Este usuario ja esta ativo na empresa.");
      }
    }

    await this.subscriptionsService.assertCanCreate(companyId, "users");

    if (!user) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: this.getSetPasswordUrl(companyId, "invite")
        }
      );

      if (error) {
        throw new BadRequestException(
          error.message ?? "Nao foi possivel enviar o convite."
        );
      }

      if (!data.user?.id || !data.user.email) {
        throw new BadRequestException("Convite criado sem usuario valido.");
      }

      user = {
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name ?? null,
        id: data.user.id
      };
    }

    if (existingMember) {
      const { data, error } = await supabase
        .from("company_users")
        .update({
          invited_by: invitedBy,
          permissions: getPermissionsForRole(dto.role, dto.permissions),
          role: dto.role,
          status: "active"
        })
        .eq("company_id", companyId)
        .eq("id", existingMember.id)
        .select("id, user_id, role, status, permissions, created_at")
        .maybeSingle();

      if (error) {
        throwDatabaseError(error);
      }

      if (!data) {
        throw new NotFoundException("Usuario da empresa nao encontrado.");
      }

      return mapMember({
        ...(data as CompanyUserRow),
        users: user
      });
    }

    const { data, error } = await supabase
      .from("company_users")
      .insert({
        company_id: companyId,
        invited_by: invitedBy,
        permissions: getPermissionsForRole(dto.role, dto.permissions),
        role: dto.role,
        status: "active",
        user_id: user.id
      })
      .select("id, user_id, role, status, permissions, created_at")
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    return mapMember({
      ...(data as CompanyUserRow),
      users: user
    });
  }

  async resendMemberAccess(
    companyId: string,
    currentRole: string,
    memberId: string
  ) {
    requireAdmin(currentRole);

    const member = await this.getMemberById(companyId, memberId);
    const user = await this.findUserById(member.user_id);

    if (!user?.email) {
      throw new BadRequestException("Usuario sem email valido.");
    }

    if (member.status === "disabled") {
      throw new BadRequestException(
        "Ative o usuario antes de reenviar o acesso."
      );
    }

    const supabase = this.supabaseFactory.createAdmin();
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: this.getSetPasswordUrl(companyId, "invite")
    });

    if (error) {
      throw new BadRequestException(
        error.message ?? "Nao foi possivel reenviar o acesso."
      );
    }

    return {
      email: user.email
    };
  }

  async updateMember(
    companyId: string,
    currentRole: string,
    memberId: string,
    dto: UpdateMemberDto
  ) {
    requireAdmin(currentRole);

    if (
      dto.role === undefined &&
      dto.status === undefined &&
      dto.permissions === undefined
    ) {
      throw new BadRequestException("Informe perfil ou status para atualizar.");
    }

    const member = await this.getMemberById(companyId, memberId);

    await this.ensureAdminWillRemain(companyId, member, dto);

    if (
      dto.status !== undefined &&
      dto.status !== "disabled" &&
      member.status === "disabled"
    ) {
      await this.subscriptionsService.assertCanCreate(companyId, "users");
    }

    const supabase = this.supabaseFactory.createAdmin();
    const payload: Record<string, unknown> = {};

    if (dto.role !== undefined) {
      payload.role = dto.role;
    }

    const nextRole = dto.role ?? member.role;

    if (dto.permissions !== undefined || dto.role !== undefined) {
      const nextPermissions =
        dto.permissions ??
        (dto.role === "employee"
          ? createDefaultEmployeePermissionMap()
          : normalizePermissionMap(member.permissions));

      payload.permissions = getPermissionsForRole(nextRole, nextPermissions);
    }

    if (dto.status !== undefined) {
      payload.status = dto.status;
    }

    const { data, error } = await supabase
      .from("company_users")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", memberId)
      .select("id, user_id, role, status, permissions, created_at")
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Usuario da empresa nao encontrado.");
    }

    const user = await this.findUserById((data as CompanyUserRow).user_id);

    return mapMember({
      ...(data as CompanyUserRow),
      users: user
    });
  }

  private async findUserByEmail(email: string) {
    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("email", email)
      .limit(1);

    if (error) {
      throwDatabaseError(error);
    }

    return ((data?.[0] as UserJoin | undefined) ?? null) as UserJoin | null;
  }

  private async findUserById(userId: string) {
    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    return (data as UserJoin | null) ?? null;
  }

  private async getMemberByUserId(companyId: string, userId: string) {
    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("company_users")
      .select("id, user_id, role, status, permissions, created_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    return (data as CompanyUserRow | null) ?? null;
  }

  private async getMemberById(companyId: string, memberId: string) {
    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("company_users")
      .select("id, user_id, role, status, permissions, created_at")
      .eq("company_id", companyId)
      .eq("id", memberId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Usuario da empresa nao encontrado.");
    }

    return data as CompanyUserRow;
  }

  private async ensureAdminWillRemain(
    companyId: string,
    member: CompanyUserRow,
    dto: UpdateMemberDto
  ) {
    const willRemoveAdmin =
      member.role === "admin" &&
      ((dto.role !== undefined && dto.role !== "admin") ||
        dto.status === "disabled");

    if (!willRemoveAdmin) {
      return;
    }

    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("company_users")
      .select("id")
      .eq("company_id", companyId)
      .eq("role", "admin")
      .eq("status", "active");

    if (error) {
      throwDatabaseError(error);
    }

    const activeAdmins = (data ?? []) as Array<{ id: string }>;

    if (activeAdmins.length <= 1) {
      throw new BadRequestException(
        "A empresa precisa manter pelo menos um administrador ativo."
      );
    }
  }

  private getSetPasswordUrl(
    companyId?: string,
    type: "invite" | "recovery" = "invite"
  ) {
    const appUrl = this.config.get<string>(
      "NEXT_PUBLIC_APP_URL",
      "http://localhost:3000"
    );

    const url = new URL(`${appUrl.replace(/\/$/, "")}/set-password`);
    url.searchParams.set("type", type);

    if (companyId) {
      url.searchParams.set("company_id", companyId);
    }

    return url.toString();
  }
}
