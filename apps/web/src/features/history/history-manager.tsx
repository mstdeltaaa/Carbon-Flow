"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileClock,
  FileText,
  Inbox,
  Loader2,
  Package,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  UserRound,
  UsersRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuditLog = {
  action: string;
  companyId: string | null;
  createdAt: string;
  entityId: string | null;
  entityType: string;
  id: string;
  metadata: Record<string, unknown>;
  user: {
    email: string | null;
    fullName: string | null;
    id: string;
  } | null;
  userId: string | null;
};

type HistoryManagerProps = {
  companyId: string;
  role: string | null;
};

type EntityOption = {
  icon: LucideIcon;
  label: string;
  value: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const actionLabels: Record<string, string> = {
  "budget.approved": "Aprovou orçamento",
  "budget.created": "Criou orçamento",
  "budget.deleted": "Excluiu orçamento",
  "budget.updated": "Atualizou orçamento",
  "company.updated": "Atualizou empresa",
  "customer.created": "Criou cliente",
  "customer.deleted": "Excluiu cliente",
  "customer.updated": "Atualizou cliente",
  "finance.transaction_cancelled": "Cancelou lançamento",
  "finance.transaction_created": "Criou lançamento",
  "finance.transaction_paid": "Marcou lançamento como pago",
  "finance.transaction_updated": "Atualizou lançamento",
  "ingredient.created": "Criou insumo",
  "ingredient.deactivated": "Desativou insumo",
  "ingredient.updated": "Atualizou insumo",
  "member.access_resent": "Reenviou acesso",
  "member.invited": "Adicionou usuário",
  "member.reactivated": "Reativou usuário",
  "member.updated": "Atualizou usuário",
  "product.created": "Criou produto",
  "product.deactivated": "Desativou produto",
  "product.updated": "Atualizou produto",
  "sale.cancelled": "Cancelou venda",
  "sale.created": "Criou venda direta",
  "sale.created_from_budget": "Converteu orçamento em venda",
  "stock.adjustment_created": "Ajustou estoque",
  "stock.entry_created": "Registrou entrada",
  "subscription.activated": "Ativou plano Pro",
  "subscription.cancelled": "Cancelou assinatura",
  "subscription.cancelled_by_provider": "Assinatura cancelada",
  "subscription.checkout_created": "Gerou checkout Pro",
  "subscription.past_due": "Plano com pendência",
  "subscription.payment_received": "Confirmou pagamento Pro",
  "subscription.pix_created": "Gerou Pix Pro",
  "subscription.trial_started": "Iniciou teste grátis"
};

const entityLabels: Record<string, string> = {
  budget: "Orçamentos",
  company: "Empresa",
  company_user: "Usuários",
  customer: "Clientes",
  financial_transaction: "Financeiro",
  ingredient: "Insumos",
  product: "Produtos",
  sale: "Vendas",
  stock_movement: "Estoque",
  subscription: "Planos"
};

const entityOptions: EntityOption[] = [
  { icon: Activity, label: "Tudo", value: "all" },
  { icon: FileText, label: "Orçamentos", value: "budget" },
  { icon: ShoppingCart, label: "Vendas", value: "sale" },
  { icon: Package, label: "Produtos", value: "product" },
  { icon: Boxes, label: "Insumos", value: "ingredient" },
  { icon: ClipboardList, label: "Estoque", value: "stock_movement" },
  { icon: UserRound, label: "Clientes", value: "customer" },
  { icon: BadgeDollarSign, label: "Financeiro", value: "financial_transaction" },
  { icon: UsersRound, label: "Usuários", value: "company_user" },
  { icon: Building2, label: "Empresa", value: "company" },
  { icon: CreditCard, label: "Planos", value: "subscription" }
];

const periodOptions = [
  { label: "Tudo", value: "all" },
  { label: "24h", value: "24h" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" }
] as const;

const metadataLabels: Record<string, string> = {
  amount: "Valor",
  budgetNumber: "Orçamento",
  category: "Categoria",
  changedFields: "Campos alterados",
  compositionChanged: "Composição alterada",
  currentPeriodEnd: "Válido até",
  currentStock: "Estoque anterior",
  email: "E-mail",
  estimatedCost: "Custo estimado",
  estimatedProfit: "Lucro estimado",
  expiresAt: "Expira em",
  itemCount: "Itens",
  logoUpdated: "Logo atualizada",
  name: "Nome",
  nextRole: "Novo perfil",
  nextStatus: "Novo status",
  nextStock: "Estoque atual",
  number: "Número",
  paymentId: "Pagamento",
  permissionsChanged: "Permissões alteradas",
  phone: "Telefone",
  plan: "Plano",
  previousRole: "Perfil anterior",
  previousStatus: "Status anterior",
  provider: "Provedor",
  providerSubscriptionId: "Assinatura",
  quantityDelta: "Movimentação",
  restoredStockMovements: "Estornos de estoque",
  role: "Perfil",
  salePrice: "Preço de venda",
  sku: "SKU",
  status: "Status",
  stockMovements: "Baixas de estoque",
  stockQuantity: "Estoque",
  totalAmount: "Total",
  type: "Tipo",
  unit: "Unidade",
  unitCost: "Custo unitário"
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  employee: "Funcionário",
  seller: "Vendedor"
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  approved: "Aprovado",
  cancelled: "Cancelado",
  completed: "Concluído",
  converted: "Convertido",
  draft: "Rascunho",
  free: "Free",
  inactive: "Inativo",
  invited: "Convidado",
  paid: "Pago",
  past_due: "Pendente",
  pending: "Pendente",
  pro: "Pro",
  sent: "Enviado",
  trialing: "Teste grátis"
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

function getMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDocumentNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `#${String(value).padStart(6, "0")}`;
}

function formatRelativeTime(value: string) {
  const createdAt = new Date(value).getTime();
  const diffInMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));

  if (diffInMinutes < 1) {
    return "agora";
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes} min`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);

  if (diffInHours < 24) {
    return `${diffInHours}h`;
  }

  const diffInDays = Math.floor(diffInHours / 24);

  return `${diffInDays}d`;
}

function formatMetadataValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value === "number") {
    if (
      ["amount", "estimatedCost", "estimatedProfit", "salePrice", "totalAmount", "unitCost"].includes(
        key
      )
    ) {
      return currencyFormatter.format(value);
    }

    if (["budgetNumber", "number"].includes(key)) {
      return formatDocumentNumber(value);
    }

    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "-";
  }

  if (typeof value === "string") {
    if (key.toLowerCase().includes("date") || key.endsWith("At") || key.endsWith("End")) {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return dateTimeFormatter.format(date);
      }
    }

    return roleLabels[value] ?? statusLabels[value] ?? value;
  }

  return JSON.stringify(value);
}

function getEntityOption(entityType: string) {
  return (
    entityOptions.find((option) => option.value === entityType) ?? {
      icon: FileClock,
      label: entityLabels[entityType] ?? entityType,
      value: entityType
    }
  );
}

function getLogSummary(log: AuditLog) {
  const number = getMetadataNumber(log.metadata, "number");
  const budgetNumber = getMetadataNumber(log.metadata, "budgetNumber");
  const name = getMetadataString(log.metadata, "name");
  const email = getMetadataString(log.metadata, "email");
  const category = getMetadataString(log.metadata, "category");
  const ingredientName = getMetadataString(log.metadata, "ingredientName");
  const totalAmount = getMetadataNumber(log.metadata, "totalAmount");
  const amount = getMetadataNumber(log.metadata, "amount");

  if (log.action === "sale.created_from_budget") {
    return `${formatDocumentNumber(budgetNumber)} virou venda ${formatDocumentNumber(number)}`;
  }

  if (log.entityType === "sale") {
    return `Venda ${formatDocumentNumber(number)}`;
  }

  if (log.entityType === "budget") {
    return `Orçamento ${formatDocumentNumber(number)}`;
  }

  if (log.entityType === "stock_movement") {
    return ingredientName ? `Estoque de ${ingredientName}` : "Movimentação de estoque";
  }

  if (log.entityType === "financial_transaction") {
    const formattedAmount = amount === null ? "" : ` · ${currencyFormatter.format(amount)}`;

    return `${category ?? "Lançamento financeiro"}${formattedAmount}`;
  }

  if (log.entityType === "subscription") {
    return statusLabels[getMetadataString(log.metadata, "status") ?? ""] ?? "Plano da empresa";
  }

  if (log.entityType === "company_user") {
    return email ?? "Usuário da empresa";
  }

  if (totalAmount !== null) {
    return currencyFormatter.format(totalAmount);
  }

  return name ?? entityLabels[log.entityType] ?? log.entityType;
}

function getActorName(log: AuditLog) {
  return log.user?.fullName ?? log.user?.email ?? "Sistema";
}

function getMetadataRows(log: AuditLog) {
  return Object.entries(log.metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 8)
    .map(([key, value]) => ({
      label: metadataLabels[key] ?? key,
      value: formatMetadataValue(key, value)
    }));
}

function isInsidePeriod(log: AuditLog, period: string) {
  if (period === "all") {
    return true;
  }

  const createdAt = new Date(log.createdAt).getTime();
  const days = period === "24h" ? 1 : period === "7d" ? 7 : 30;

  return createdAt >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function StatCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
        <Icon className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
    </article>
  );
}

export function HistoryManager({ companyId, role }: HistoryManagerProps) {
  const [isLoading, setIsLoading] = useState(role === "admin");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<(typeof periodOptions)[number]["value"]>("30d");

  const request = useCallback(
    async <T,>(path: string): Promise<T> => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Sessão expirada. Entre novamente.");
      }

      const response = await fetch(`${env.apiUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "x-company-id": companyId
        }
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(getApiMessage(payload, "Não foi possível carregar."));
      }

      return payload as T;
    },
    [companyId]
  );

  const loadLogs = useCallback(async () => {
    if (role !== "admin") {
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      setLogs(await request<AuditLog[]>("/audit-logs"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [request, role]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesEntity =
        entityFilter === "all" || log.entityType === entityFilter;
      const matchesPeriod = isInsidePeriod(log, periodFilter);
      const matchesSearch =
        !term ||
        [
          actionLabels[log.action] ?? log.action,
          entityLabels[log.entityType] ?? log.entityType,
          getLogSummary(log),
          getActorName(log),
          JSON.stringify(log.metadata)
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesEntity && matchesPeriod && matchesSearch;
    });
  }, [entityFilter, logs, periodFilter, search]);

  const lastDayLogs = logs.filter((log) => isInsidePeriod(log, "24h")).length;
  const actorCount = new Set(logs.map((log) => log.userId ?? "system")).size;
  const entityCount = new Set(logs.map((log) => log.entityType)).size;

  if (role !== "admin") {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-8 text-center">
        <ShieldCheck
          className="mx-auto h-8 w-8 text-[var(--primary)]"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-xl font-semibold text-white">
          Histórico restrito
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Apenas administradores podem ver registros de auditoria.
        </p>
      </section>
    );
  }

  return (
    <>
      <header className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[var(--muted-foreground)]">
              Auditoria e segurança
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
              Histórico
            </h1>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            onClick={() => void loadLogs()}
            type="button"
          >
            <RefreshCcw
              className={["h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")}
              aria-hidden="true"
            />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileClock} label="Registros" value={logs.length} />
        <StatCard icon={CalendarDays} label="Últimas 24h" value={lastDayLogs} />
        <StatCard icon={UsersRound} label="Autores" value={actorCount} />
        <StatCard icon={SlidersHorizontal} label="Áreas" value={entityCount} />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              className="h-10 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por ação, usuário ou registro"
              type="search"
              value={search}
            />
          </label>

          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
            onChange={(event) => setEntityFilter(event.target.value)}
            value={entityFilter}
          >
            {entityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
            onChange={(event) =>
              setPeriodFilter(
                event.target.value as (typeof periodOptions)[number]["value"]
              )
            }
            value={periodFilter}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="rounded-full border border-[var(--border)] px-3 py-1">
            {filteredLogs.length} registros encontrados
          </span>
          {entityFilter !== "all" ? (
            <span className="rounded-full border border-[var(--border)] px-3 py-1">
              {getEntityOption(entityFilter).label}
            </span>
          ) : null}
        </div>

        {message ? (
          <p className="mt-5 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
            {message}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {isLoading ? (
            <div className="rounded-lg border border-[var(--border)] bg-[rgb(8_10_11/0.56)] p-8 text-center">
              <Loader2
                className="mx-auto h-5 w-5 animate-spin text-[var(--primary)]"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-white">
                Carregando histórico
              </p>
            </div>
          ) : null}

          {!isLoading && filteredLogs.length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[rgb(8_10_11/0.56)] p-8 text-center">
              <Inbox
                className="mx-auto h-5 w-5 text-[var(--primary)]"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-white">
                Nenhum registro encontrado
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--muted-foreground)]">
                As ações importantes da empresa aparecerão aqui.
              </p>
            </div>
          ) : null}

          {!isLoading
            ? filteredLogs.map((log) => {
                const entity = getEntityOption(log.entityType);
                const Icon = entity.icon;
                const metadataRows = getMetadataRows(log);

                return (
                  <article
                    className="rounded-lg border border-[var(--border)] bg-[rgb(8_10_11/0.54)] p-4 transition hover:border-[rgb(var(--primary-rgb)/0.55)]"
                    key={log.id}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--primary-rgb)/0.12)] text-[var(--primary)]">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-semibold text-white">
                              {actionLabels[log.action] ?? log.action}
                            </h2>
                            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                              {entity.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            {getLogSummary(log)}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-1 text-left text-xs text-[var(--muted-foreground)] lg:text-right">
                        <span>{dateTimeFormatter.format(new Date(log.createdAt))}</span>
                        <span>{formatRelativeTime(log.createdAt)}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 lg:grid-cols-[220px,1fr]">
                      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                        <span className="min-w-0 truncate">{getActorName(log)}</span>
                      </div>

                      {metadataRows.length > 0 ? (
                        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          {metadataRows.map((row) => (
                            <div
                              className="rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.62)] p-3"
                              key={`${log.id}-${row.label}`}
                            >
                              <dt className="text-[11px] uppercase text-[var(--muted-foreground)]">
                                {row.label}
                              </dt>
                              <dd className="mt-1 break-words text-sm font-medium text-white">
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="text-sm text-[var(--muted-foreground)]">
                          Sem detalhes adicionais.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })
            : null}
        </div>
      </section>
    </>
  );
}
