"use client";

import {
  ArrowUpRight,
  Building2,
  CreditCard,
  ImagePlus,
  KeyRound,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  companyPermissions,
  createDefaultEmployeePermissionMap,
  createEmptyPermissionMap,
  normalizePermissionMap,
  type CompanyPermission,
  type CompanyPermissionMap
} from "@/lib/access-control";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CompanyRole = "admin" | "employee" | "seller";
type CompanyUserStatus = "active" | "invited" | "disabled";
type SubscriptionPlan = "free" | "pro" | "enterprise";
type SubscriptionStatus =
  "active" | "inactive" | "trialing" | "past_due" | "cancelled";
type PlanLimitKey =
  | "users"
  | "ingredients"
  | "products"
  | "customers"
  | "budgets_per_month"
  | "sales_per_month";
type PlanLimits = Record<PlanLimitKey, number | null>;
type PlanUsage = Record<PlanLimitKey, number>;

type Company = {
  document: string | null;
  email: string | null;
  id: string;
  logoUrl: string | null;
  name: string;
  phone: string | null;
  slug: string;
  updatedAt: string;
};

type Member = {
  createdAt: string;
  id: string;
  permissions: CompanyPermissionMap;
  role: CompanyRole;
  status: CompanyUserStatus;
  user: {
    email: string;
    fullName: string | null;
    id: string;
  } | null;
};

type Subscription = {
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  usage: PlanUsage;
};

type SettingsPayload = {
  company: Company;
  members: Member[];
  subscription: Subscription;
};

type CompanyFormState = {
  document: string;
  email: string;
  name: string;
  phone: string;
};

type InviteFormState = {
  email: string;
  permissions: CompanyPermissionMap;
  role: CompanyRole;
};

type SettingsManagerProps = {
  companyId: string;
  role: string | null;
};

const planLabels: Record<SubscriptionPlan, string> = {
  enterprise: "Empresa",
  free: "Free",
  pro: "Pro"
};

const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  active: "Ativo",
  cancelled: "Cancelado",
  inactive: "Inativo",
  past_due: "Pagamento pendente",
  trialing: "Teste"
};

const usageOrder: PlanLimitKey[] = [
  "users",
  "ingredients",
  "products",
  "customers",
  "budgets_per_month",
  "sales_per_month"
];
const millisecondsInDay = 24 * 60 * 60 * 1000;
const maxLogoFileSize = 10 * 1024 * 1024;
const acceptedLogoTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml"
];

const permissionLabels: Record<CompanyPermission, string> = {
  budgets: "Orçamentos",
  customers: "Clientes",
  dashboard: "Dashboard",
  finance: "Financeiro",
  ingredients: "Insumos",
  products: "Produtos",
  sales: "Vendas",
  stock: "Estoque"
};

const fixedRolePermissionText: Record<CompanyRole, string> = {
  admin: "Acesso total",
  employee: "Personalizado",
  seller: "Clientes, produtos e orçamentos"
};

function getApiMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    Array.isArray(payload.message)
  ) {
    return payload.message.join(" ");
  }

  return fallback;
}

function getLimitLabel(key: string) {
  const labels: Record<string, string> = {
    budgets_per_month: "Orçamentos/mês",
    customers: "Clientes",
    ingredients: "Insumos",
    products: "Produtos",
    sales_per_month: "Vendas/mês",
    users: "Usuários"
  };

  return labels[key] ?? key;
}

function formatLimit(limit: number | null) {
  return limit === null ? "Ilimitado" : String(limit);
}

function getUsagePercent(usage: number, limit: number | null) {
  if (limit === null) {
    return 0;
  }

  if (limit <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((usage / limit) * 100));
}

function getTrialDaysLeft(currentPeriodEnd: string | null) {
  if (!currentPeriodEnd) {
    return null;
  }

  const endsAt = Date.parse(currentPeriodEnd);

  if (!Number.isFinite(endsAt)) {
    return null;
  }

  return Math.max(0, Math.ceil((endsAt - Date.now()) / millisecondsInDay));
}

function getTrialLabel(currentPeriodEnd: string | null) {
  const daysLeft = getTrialDaysLeft(currentPeriodEnd);

  if (daysLeft === null) {
    return "Teste grátis ativo";
  }

  if (daysLeft === 0) {
    return "Termina hoje";
  }

  return daysLeft === 1 ? "1 dia restante" : `${daysLeft} dias restantes`;
}

function isLimitReached(settings: SettingsPayload | null, key: PlanLimitKey) {
  if (!settings) {
    return false;
  }

  const limit = settings.subscription.limits[key];

  return limit !== null && limit !== undefined
    ? settings.subscription.usage[key] >= limit
    : false;
}

function countEnabledMembers(members: Member[]) {
  return members.filter((member) => member.status !== "disabled").length;
}

function withUpdatedMembersUsage(
  settings: SettingsPayload,
  members: Member[]
): SettingsPayload {
  return {
    ...settings,
    members,
    subscription: {
      ...settings.subscription,
      usage: {
        ...settings.subscription.usage,
        users: countEnabledMembers(members)
      }
    }
  };
}

function createFormState(company: Company): CompanyFormState {
  return {
    document: company.document ?? "",
    email: company.email ?? "",
    name: company.name,
    phone: company.phone ?? ""
  };
}

function getNormalizedMemberPermissions(member: Member) {
  return normalizePermissionMap(member.permissions, createEmptyPermissionMap());
}

function getPermissionSummary(member: Member) {
  if (member.role !== "employee") {
    return fixedRolePermissionText[member.role];
  }

  const enabledPermissions = companyPermissions.filter(
    (permission) => getNormalizedMemberPermissions(member)[permission]
  );

  if (enabledPermissions.length === 0) {
    return "Sem módulos liberados";
  }

  if (enabledPermissions.length === companyPermissions.length) {
    return "Todos os módulos operacionais";
  }

  return enabledPermissions
    .map((permission) => permissionLabels[permission])
    .join(", ");
}

export function SettingsManager({ companyId, role }: SettingsManagerProps) {
  const [form, setForm] = useState<CompanyFormState>({
    document: "",
    email: "",
    name: "",
    phone: ""
  });
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: "",
    permissions: createDefaultEmployeePermissionMap(),
    role: "seller"
  });
  const [isInviting, setIsInviting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isResendingMemberId, setIsResendingMemberId] = useState<string | null>(
    null
  );
  const [isUpdatingMemberId, setIsUpdatingMemberId] = useState<string | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);

  const isAdmin = role === "admin";
  const userLimitReached = isLimitReached(settings, "users");

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Sessão expirada. Entre novamente.");
      }

      const response = await fetch(`${env.apiUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "x-company-id": companyId,
          ...init?.headers
        }
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(getApiMessage(payload, "Não foi possível concluir."));
      }

      return payload as T;
    },
    [companyId]
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const data = await request<SettingsPayload>("/companies/settings");
      setSettings(data);
      setForm(createFormState(data.company));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateField(field: keyof CompanyFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateInviteField(field: "email", value: string): void;
  function updateInviteField(field: "role", value: CompanyRole): void;
  function updateInviteField(field: keyof InviteFormState, value: string) {
    if (field === "role") {
      const nextRole = value as CompanyRole;

      setInviteForm((current) => ({
        ...current,
        permissions:
          nextRole === "employee"
            ? current.permissions
            : createDefaultEmployeePermissionMap(),
        role: nextRole
      }));
      return;
    }

    setInviteForm((current) => ({
      ...current,
      email: value
    }));
  }

  function updateInvitePermission(
    permission: CompanyPermission,
    checked: boolean
  ) {
    setInviteForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permission]: checked
      }
    }));
  }

  function getMemberRolePermissions(member: Member, nextRole: CompanyRole) {
    if (nextRole === "employee") {
      return member.role === "employee"
        ? getNormalizedMemberPermissions(member)
        : createDefaultEmployeePermissionMap();
    }

    return createEmptyPermissionMap();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const company = await request<Company>("/companies/settings", {
        body: JSON.stringify({
          document: form.document.trim() || null,
          email: form.email.trim() || null,
          name: form.name.trim(),
          phone: form.phone.trim() || null
        }),
        method: "PATCH"
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              company
            }
          : current
      );
      setForm(createFormState(company));
      setMessage("Dados da empresa atualizados.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateCompanyLogo(logoUrl: string | null) {
    const company = await request<Company>("/companies/settings", {
      body: JSON.stringify({ logoUrl }),
      method: "PATCH"
    });

    setSettings((current) =>
      current
        ? {
            ...current,
            company
          }
        : current
    );
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    setMessage(null);

    if (!acceptedLogoTypes.includes(file.type)) {
      setMessage("Envie uma logo em PNG, JPG, WebP ou SVG.");
      return;
    }

    if (file.size > maxLogoFileSize) {
      setMessage("A logo deve ter no máximo 10 MB.");
      return;
    }

    setIsUploadingLogo(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const filePath = `companies/${companyId}/logo-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("company-assets")
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage
        .from("company-assets")
        .getPublicUrl(filePath);

      await updateCompanyLogo(data.publicUrl);
      setMessage("Logo da empresa atualizada.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a logo."
      );
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function removeCompanyLogo() {
    setIsUploadingLogo(true);
    setMessage(null);

    try {
      await updateCompanyLogo(null);
      setMessage("Logo da empresa removida.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível remover a logo."
      );
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleInviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsInviting(true);
    setMessage(null);

    try {
      const member = await request<Member>("/companies/members/invite", {
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          permissions:
            inviteForm.role === "employee"
              ? inviteForm.permissions
              : createEmptyPermissionMap(),
          role: inviteForm.role
        }),
        method: "POST"
      });

      setSettings((current) =>
        current
          ? withUpdatedMembersUsage(
              current,
              [...current.members, member].sort((a, b) =>
                (a.user?.email ?? "").localeCompare(b.user?.email ?? "")
              )
            )
          : current
      );
      setInviteForm({
        email: "",
        permissions: createDefaultEmployeePermissionMap(),
        role: "seller"
      });
      setMessage("Convite enviado e acesso criado.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível convidar."
      );
    } finally {
      setIsInviting(false);
    }
  }

  async function updateMember(
    member: Member,
    payload: Partial<Pick<Member, "permissions" | "role" | "status">>
  ) {
    setIsUpdatingMemberId(member.id);
    setMessage(null);

    try {
      const updatedMember = await request<Member>(
        `/companies/members/${member.id}`,
        {
          body: JSON.stringify(payload),
          method: "PATCH"
        }
      );

      setSettings((current) =>
        current
          ? withUpdatedMembersUsage(
              current,
              current.members.map((currentMember) =>
                currentMember.id === updatedMember.id
                  ? updatedMember
                  : currentMember
              )
            )
          : current
      );
      setMessage("Usuário atualizado.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível atualizar."
      );
    } finally {
      setIsUpdatingMemberId(null);
    }
  }

  async function handleMemberRoleChange(member: Member, nextRole: CompanyRole) {
    await updateMember(member, {
      permissions: getMemberRolePermissions(member, nextRole),
      role: nextRole
    });
  }

  async function handleMemberPermissionChange(
    member: Member,
    permission: CompanyPermission,
    checked: boolean
  ) {
    await updateMember(member, {
      permissions: {
        ...getNormalizedMemberPermissions(member),
        [permission]: checked
      }
    });
  }

  async function resendAccess(member: Member) {
    setIsResendingMemberId(member.id);
    setMessage(null);

    try {
      const result = await request<{ email: string }>(
        `/companies/members/${member.id}/resend-access`,
        {
          method: "POST"
        }
      );

      setMessage(`Link de acesso enviado para ${result.email}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível reenviar o acesso."
      );
    } finally {
      setIsResendingMemberId(null);
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-foreground)]">
            Administração
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Configurações
          </h1>
        </div>
      </header>

      {message ? (
        <p className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      {isLoading ? (
        <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando configurações
          </span>
        </section>
      ) : null}

      {!isLoading && settings ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white">
                  Dados da empresa
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Informações usadas nos documentos e no ambiente
                </p>
              </div>
              <Building2
                className="h-5 w-5 shrink-0 text-[var(--primary)]"
                aria-hidden="true"
              />
            </div>

            <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
              <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Logo da empresa
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                      Usada como marca principal em orçamentos, vendas, fichas
                      técnicas e impressões.
                    </p>
                  </div>

                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-[var(--border)] bg-[rgb(16_19_20/0.68)] p-2 text-center">
                    {settings.company.logoUrl ? (
                      <img
                        alt={`Logo de ${settings.company.name}`}
                        className="h-full w-full object-contain"
                        src={settings.company.logoUrl}
                      />
                    ) : (
                      <span className="text-[10px] font-medium leading-4 text-[var(--muted-foreground)]">
                        Sua logo aqui
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <label
                    className={[
                      "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-white transition hover:bg-[var(--secondary)]",
                      !isAdmin || isUploadingLogo
                        ? "pointer-events-none opacity-55"
                        : ""
                    ].join(" ")}
                    htmlFor="company-logo-upload"
                  >
                    {isUploadingLogo ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    )}
                    Enviar logo
                  </label>
                  <input
                    accept={acceptedLogoTypes.join(",")}
                    className="sr-only"
                    disabled={!isAdmin || isUploadingLogo}
                    id="company-logo-upload"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void handleLogoUpload(file);
                    }}
                    type="file"
                  />

                  {settings.company.logoUrl ? (
                    <Button
                      disabled={!isAdmin || isUploadingLogo}
                      onClick={() => void removeCompanyLogo()}
                      type="button"
                      variant="secondary"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remover logo
                    </Button>
                  ) : null}
                </div>

                <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
                  PNG, JPG, WebP ou SVG até 10 MB. Se nenhuma logo for enviada,
                  os documentos usam a marca do Carbon Flow.
                </p>
              </div>

              <label className="grid gap-2 text-sm text-white">
                Nome da empresa
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  disabled={!isAdmin}
                  onChange={(event) => updateField("name", event.target.value)}
                  required
                  type="text"
                  value={form.name}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm text-white">
                  Documento
                  <input
                    className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                    disabled={!isAdmin}
                    onChange={(event) =>
                      updateField("document", event.target.value)
                    }
                    placeholder="CPF ou CNPJ"
                    type="text"
                    value={form.document}
                  />
                </label>

                <label className="grid gap-2 text-sm text-white">
                  Telefone
                  <input
                    className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                    disabled={!isAdmin}
                    onChange={(event) =>
                      updateField("phone", event.target.value)
                    }
                    placeholder="(11) 99999-9999"
                    type="tel"
                    value={form.phone}
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm text-white">
                E-mail comercial
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  disabled={!isAdmin}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="contato@empresa.com"
                  type="email"
                  value={form.email}
                />
              </label>

              <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                <p className="text-xs text-[var(--muted-foreground)]">Slug</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {settings.company.slug}
                </p>
              </div>

              <Button disabled={!isAdmin || isSaving} type="submit">
                {isSaving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Salvar empresa
              </Button>

              {!isAdmin ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Apenas administradores podem editar estes dados.
                </p>
              ) : null}
            </form>
          </section>

          <div className="grid min-w-0 gap-5">
            <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    Plano atual
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Estrutura preparada para cobrança futura
                  </p>
                </div>
                <CreditCard
                  className="h-5 w-5 shrink-0 text-[var(--primary)]"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <article className="min-w-0 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Plano
                  </p>
                  <p className="mt-2 break-words text-xl font-semibold text-white">
                    {settings.subscription.status === "trialing" &&
                    settings.subscription.plan === "pro"
                      ? "Pro grátis"
                      : planLabels[settings.subscription.plan]}
                  </p>
                </article>
                <article className="min-w-0 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Status
                  </p>
                  <p className="mt-2 break-words text-xl font-semibold text-white">
                    {subscriptionStatusLabels[settings.subscription.status]}
                  </p>
                </article>
                {settings.subscription.status === "trialing" ? (
                  <article className="min-w-0 rounded-md border border-[rgb(159_243_196/0.28)] bg-[rgb(159_243_196/0.08)] p-4">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Teste grátis
                    </p>
                    <p className="mt-2 break-words text-xl font-semibold text-white">
                      {getTrialLabel(settings.subscription.currentPeriodEnd)}
                    </p>
                  </article>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {usageOrder.map((key) => {
                  const usage = settings.subscription.usage[key];
                  const limit = settings.subscription.limits[key];
                  const percent = getUsagePercent(usage, limit);
                  const reached = limit !== null && usage >= limit;

                  return (
                    <article
                      className="min-w-0 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                      key={key}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {getLimitLabel(key)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {usage} / {formatLimit(limit)}
                          </p>
                        </div>
                        {reached ? (
                          <span className="shrink-0 rounded-md bg-[rgb(239_68_68/0.14)] px-2 py-1 text-xs text-red-300">
                            Limite
                          </span>
                        ) : null}
                      </div>
                      {limit !== null ? (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
                          <div
                            className="h-full rounded-full bg-[var(--primary)]"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      ) : (
                        <div className="mt-3 h-2 rounded-full bg-[rgb(159_243_196/0.2)]" />
                      )}
                    </article>
                  );
                })}
              </div>

              <Button asChild className="mt-5 w-full sm:w-auto">
                <Link href="/billing">
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  Ver planos
                </Link>
              </Button>
            </section>

            <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    Usuários e permissões
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Convites, perfis e acesso da equipe
                  </p>
                </div>
                <UsersRound
                  className="h-5 w-5 shrink-0 text-[var(--primary)]"
                  aria-hidden="true"
                />
              </div>

              <form
                className="mt-5 grid min-w-0 gap-4 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                onSubmit={handleInviteMember}
              >
                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)]">
                  <label className="grid min-w-0 gap-2 text-sm text-white">
                    E-mail
                    <input
                      className="h-11 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                      disabled={!isAdmin || isInviting || userLimitReached}
                      onChange={(event) =>
                        updateInviteField("email", event.target.value)
                      }
                      placeholder="usuário@email.com"
                      required
                      type="email"
                      value={inviteForm.email}
                    />
                  </label>

                  <label className="grid min-w-0 gap-2 text-sm text-white">
                    Perfil
                    <select
                      className="h-11 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                      disabled={!isAdmin || isInviting || userLimitReached}
                      onChange={(event) =>
                        updateInviteField(
                          "role",
                          event.target.value as CompanyRole
                        )
                      }
                      value={inviteForm.role}
                    >
                      <option
                        className="bg-[#101314] text-white"
                        value="seller"
                      >
                        Vendedor
                      </option>
                      <option
                        className="bg-[#101314] text-white"
                        value="employee"
                      >
                        Funcionário
                      </option>
                      <option className="bg-[#101314] text-white" value="admin">
                        Administrador
                      </option>
                    </select>
                  </label>
                </div>

                {inviteForm.role === "employee" ? (
                  <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.48)] p-3">
                    <p className="text-sm font-medium text-white">
                      Módulos liberados para o funcionário
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {companyPermissions.map((permission) => (
                        <label
                          className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.48)] px-3 py-2 text-sm text-white"
                          key={permission}
                        >
                          <input
                            checked={inviteForm.permissions[permission]}
                            className="h-4 w-4 accent-[var(--primary)]"
                            disabled={
                              !isAdmin || isInviting || userLimitReached
                            }
                            onChange={(event) =>
                              updateInvitePermission(
                                permission,
                                event.target.checked
                              )
                            }
                            type="checkbox"
                          />
                          <span className="truncate">
                            {permissionLabels[permission]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {inviteForm.role === "admin"
                      ? "Administradores têm acesso total ao ambiente."
                      : "Vendedores acessam clientes, produtos e orçamentos."}
                  </p>
                )}

                {userLimitReached ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    O plano atual atingiu o limite de usuários.
                  </p>
                ) : null}

                <div className="flex min-w-0 justify-end">
                  <Button
                    className="min-h-11 w-full px-5 sm:w-auto sm:min-w-[8.5rem]"
                    disabled={!isAdmin || isInviting || userLimitReached}
                    type="submit"
                  >
                    {isInviting ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                    )}
                    Convidar
                  </Button>
                </div>
              </form>

              <div className="mt-5 max-w-full min-w-0 overflow-x-auto rounded-md">
                <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                      <th className="w-[30%] py-3 pr-4 font-medium">Usuário</th>
                      <th className="w-[18%] py-3 pr-4 font-medium">Perfil</th>
                      <th className="w-[30%] py-3 pr-4 font-medium">
                        Permissões
                      </th>
                      <th className="w-[14%] py-3 pr-4 font-medium">Acesso</th>
                      <th className="w-[8%] py-3 text-right font-medium">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {settings.members.map((member) => (
                      <tr key={member.id}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(159_243_196/0.12)] text-[var(--primary)]">
                              <ShieldCheck
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">
                                {member.user?.fullName ?? "Usuário"}
                              </p>
                              <p className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--muted-foreground)]">
                                <Mail
                                  className="h-3 w-3 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">
                                  {member.user?.email ?? "-"}
                                </span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            className="h-10 w-full min-w-[9.5rem] rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                            disabled={
                              !isAdmin || isUpdatingMemberId === member.id
                            }
                            onChange={(event) =>
                              void handleMemberRoleChange(
                                member,
                                event.target.value as CompanyRole
                              )
                            }
                            value={member.role}
                          >
                            <option
                              className="bg-[#101314] text-white"
                              value="seller"
                            >
                              Vendedor
                            </option>
                            <option
                              className="bg-[#101314] text-white"
                              value="employee"
                            >
                              Funcionário
                            </option>
                            <option
                              className="bg-[#101314] text-white"
                              value="admin"
                            >
                              Administrador
                            </option>
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          {member.role === "employee" ? (
                            <div className="grid gap-2">
                              <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                                {getPermissionSummary(member)}
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {companyPermissions.map((permission) => (
                                  <label
                                    className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.48)] px-2 py-1.5 text-xs text-white"
                                    key={permission}
                                  >
                                    <input
                                      checked={
                                        getNormalizedMemberPermissions(member)[
                                          permission
                                        ]
                                      }
                                      className="h-3.5 w-3.5 accent-[var(--primary)]"
                                      disabled={
                                        !isAdmin ||
                                        isUpdatingMemberId === member.id
                                      }
                                      onChange={(event) =>
                                        void handleMemberPermissionChange(
                                          member,
                                          permission,
                                          event.target.checked
                                        )
                                      }
                                      type="checkbox"
                                    />
                                    <span className="truncate">
                                      {permissionLabels[permission]}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-[var(--muted-foreground)]">
                              {getPermissionSummary(member)}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            className="h-10 w-full min-w-[9.5rem] rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                            disabled={
                              !isAdmin || isUpdatingMemberId === member.id
                            }
                            onChange={(event) =>
                              void updateMember(member, {
                                status: event.target.value as CompanyUserStatus
                              })
                            }
                            value={member.status}
                          >
                            <option
                              className="bg-[#101314] text-white"
                              value="active"
                            >
                              Ativo
                            </option>
                            <option
                              className="bg-[#101314] text-white"
                              value="disabled"
                            >
                              Desativado
                            </option>
                            {member.status === "invited" ? (
                              <option
                                className="bg-[#101314] text-white"
                                value="invited"
                              >
                                Convidado
                              </option>
                            ) : null}
                          </select>
                          {isUpdatingMemberId === member.id ? (
                            <Loader2
                              className="ml-2 inline h-4 w-4 animate-spin text-[var(--primary)]"
                              aria-hidden="true"
                            />
                          ) : null}
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end">
                            <button
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white disabled:opacity-50"
                              disabled={
                                !isAdmin ||
                                member.status === "disabled" ||
                                isResendingMemberId === member.id
                              }
                              onClick={() => void resendAccess(member)}
                              title="Reenviar acesso"
                              type="button"
                            >
                              {isResendingMemberId === member.id ? (
                                <Loader2
                                  className="h-4 w-4 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <KeyRound
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
