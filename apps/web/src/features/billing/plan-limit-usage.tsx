"use client";

import { AlertTriangle, CheckCircle2, Infinity, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

type SubscriptionOverview = {
  canCreate: Record<PlanLimitKey, boolean>;
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  plan: SubscriptionPlan;
  reached: PlanLimitKey[];
  status: SubscriptionStatus;
  usage: PlanUsage;
};

type PlanLimitUsageProps = {
  companyId: string;
  resource: PlanLimitKey;
};

const planLabels: Record<SubscriptionPlan, string> = {
  enterprise: "Empresa",
  free: "Free",
  pro: "Pro"
};

const resourceLabels: Record<PlanLimitKey, string> = {
  budgets_per_month: "Orçamentos neste mês",
  customers: "Clientes cadastrados",
  ingredients: "Insumos ativos",
  products: "Produtos ativos",
  sales_per_month: "Vendas neste mês",
  users: "Usuários da empresa"
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

export function PlanLimitUsage({ companyId, resource }: PlanLimitUsageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Sessão expirada. Entre novamente.");
      }

      const response = await fetch(`${env.apiUrl}/subscriptions/overview`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "x-company-id": companyId
        }
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar o plano.")
        );
      }

      setOverview(payload as SubscriptionOverview);
    } catch (error) {
      setOverview(null);
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const resourceState = useMemo(() => {
    if (!overview) {
      return null;
    }

    const usage = overview.usage[resource];
    const limit = overview.limits[resource];
    const percent = getUsagePercent(usage, limit);
    const reached = limit !== null && usage >= limit;
    const nearLimit = limit !== null && !reached && percent >= 80;

    return {
      limit,
      nearLimit,
      percent,
      reached,
      usage
    };
  }, [overview, resource]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.64)] p-4 text-sm text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando limite do plano
        </span>
      </section>
    );
  }

  if (message || !overview || !resourceState) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.64)] p-4 text-sm text-[var(--muted-foreground)]">
        {message ?? "Não foi possível carregar o limite do plano."}
      </section>
    );
  }

  const tone = resourceState.reached
    ? "border-[rgb(248_113_113/0.36)] bg-[rgb(248_113_113/0.08)]"
    : resourceState.nearLimit
      ? "border-[rgb(245_158_11/0.36)] bg-[rgb(245_158_11/0.08)]"
      : "border-[var(--border)] bg-[rgb(16_19_20/0.64)]";
  const Icon =
    resourceState.limit === null
      ? Infinity
      : resourceState.reached || resourceState.nearLimit
        ? AlertTriangle
        : CheckCircle2;

  return (
    <section className={["rounded-lg border p-4", tone].join(" ")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-[var(--muted-foreground)]">
            Plano {planLabels[overview.plan]}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            {resourceLabels[resource]}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-white">
          <Icon className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          <span>
            {resourceState.usage} / {formatLimit(resourceState.limit)}
          </span>
        </div>
      </div>

      {resourceState.limit !== null ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${resourceState.percent}%` }}
          />
        </div>
      ) : (
        <div className="mt-3 h-2 rounded-full bg-[rgb(159_243_196/0.18)]" />
      )}

      {resourceState.reached ? (
        <p className="mt-3 text-sm text-red-200">
          Limite atingido. Faça upgrade do plano para criar novos registros.
        </p>
      ) : resourceState.nearLimit ? (
        <p className="mt-3 text-sm text-amber-200">
          Você está perto do limite deste recurso.
        </p>
      ) : null}
    </section>
  );
}
