"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  FileText,
  Inbox,
  Loader2,
  PackageCheck,
  Plus,
  ShoppingCart
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type DashboardSummary = {
  period: {
    label: string;
    start: string;
    end: string;
  };
  metrics: {
    estimatedProfit: number;
    lowStockCount: number;
    openBudgetAmount: number;
    openBudgetCount: number;
    revenue: number;
    salesCount: number;
  };
  bestSellers: Array<{
    productId: string | null;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  lowStock: Array<{
    category: string | null;
    current: number;
    id: string;
    minimum: number;
    name: string;
    unit: string;
  }>;
  alerts: Array<{
    detail: string;
    severity: "info" | "warning";
    title: string;
    type: string;
  }>;
};

type DashboardScreenProps = {
  companyId: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4
});

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

function formatQuantity(value: number, unit: string) {
  return `${decimalFormatter.format(value)} ${unit}`;
}

function getProfitDetail(revenue: number, profit: number) {
  if (revenue <= 0) {
    return "Sem vendas no período";
  }

  const margin = Math.round((profit / revenue) * 1000) / 10;

  return `Margem estimada de ${decimalFormatter.format(margin)}%`;
}

function PanelState({
  description,
  isLoading = false,
  title
}: {
  description?: string;
  isLoading?: boolean;
  title: string;
}) {
  const Icon = isLoading ? Loader2 : Inbox;

  return (
    <div className="py-8 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--primary)]">
        <Icon
          className={["h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")}
          aria-hidden="true"
        />
      </span>
      <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--muted-foreground)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function DashboardScreen({ companyId }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const summary = await request<DashboardSummary>("/dashboard");
      setData(summary);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(() => {
    const summary = data?.metrics;

    return [
      {
        detail: data?.period.label ?? "Mes atual",
        icon: BarChart3,
        label: "Faturamento",
        trend: "up",
        value: currencyFormatter.format(summary?.revenue ?? 0)
      },
      {
        detail: `${summary?.openBudgetCount ?? 0} orçamentos em aberto`,
        icon: ShoppingCart,
        label: "Vendas",
        trend: "up",
        value: String(summary?.salesCount ?? 0)
      },
      {
        detail: getProfitDetail(
          summary?.revenue ?? 0,
          summary?.estimatedProfit ?? 0
        ),
        icon: ArrowUpRight,
        label: "Lucro estimado",
        trend: "up",
        value: currencyFormatter.format(summary?.estimatedProfit ?? 0)
      },
      {
        detail: "Itens precisam de reposicao",
        icon: AlertTriangle,
        label: "Estoque baixo",
        trend: "attention",
        value: String(summary?.lowStockCount ?? 0)
      }
    ];
  }, [data]);

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">Visao geral</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white sm:text-3xl">
            Dashboard da empresa
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/budgets">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Novo orçamento
            </Link>
          </Button>
          <Button asChild>
            <Link href="/sales">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ver vendas
            </Link>
          </Button>
        </div>
      </header>

      {message ? (
        <p className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--muted-foreground)]">
                {metric.label}
              </p>
              <metric.icon
                className="h-4 w-4 text-[var(--primary)]"
                aria-hidden="true"
              />
            </div>
            <p className="mt-4 text-2xl font-semibold text-white">
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : (
                metric.value
              )}
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              {metric.trend === "attention" ? (
                <ArrowDownRight
                  className="h-3.5 w-3.5 text-[var(--destructive)]"
                  aria-hidden="true"
                />
              ) : (
                <ArrowUpRight
                  className="h-3.5 w-3.5 text-[var(--accent)]"
                  aria-hidden="true"
                />
              )}
              {metric.detail}
            </p>
          </article>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Produtos mais vendidos
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Ranking do período atual
              </p>
            </div>
            <PackageCheck
              className="h-5 w-5 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>

          <div className="mt-5 divide-y divide-[var(--border)]">
            {!isLoading && (data?.bestSellers.length ?? 0) === 0 ? (
              <PanelState
                description="As vendas aparecerão aqui assim que forem registradas ou convertidas de orçamentos."
                title="Nenhuma venda no período"
              />
            ) : null}

            {isLoading ? (
              <PanelState isLoading title="Carregando ranking" />
            ) : null}

            {!isLoading
              ? data?.bestSellers.map((product, index) => (
                  <div
                    key={`${product.productId ?? product.productName}-${index}`}
                    className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--secondary)] text-sm text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {product.productName}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {decimalFormatter.format(product.quantity)} vendidos
                      </p>
                    </div>
                    <p className="text-sm font-medium text-[var(--primary)]">
                      {currencyFormatter.format(product.revenue)}
                    </p>
                  </div>
                ))
              : null}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Estoque baixo
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Insumos abaixo do mínimo
              </p>
            </div>
            <Boxes
              className="h-5 w-5 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>

          <div className="mt-5 divide-y divide-[var(--border)]">
            {!isLoading && (data?.lowStock.length ?? 0) === 0 ? (
              <PanelState
                description="Todos os insumos estão acima do estoque mínimo configurado."
                title="Estoque em dia"
              />
            ) : null}

            {isLoading ? (
              <PanelState isLoading title="Carregando estoque" />
            ) : null}

            {!isLoading
              ? data?.lowStock.map((item) => (
                  <div key={item.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        {item.name}
                      </p>
                      <span className="rounded-md bg-[rgb(255_107_107/0.12)] px-2 py-1 text-xs text-[#ff8d8d]">
                        Repor
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      Atual: {formatQuantity(item.current, item.unit)} / Mínimo:{" "}
                      {formatQuantity(item.minimum, item.unit)}
                    </p>
                  </div>
                ))
              : null}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Alertas</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Pontos que precisam de atenção
            </p>
          </div>
          <AlertTriangle
            className="h-5 w-5 text-[var(--primary)]"
            aria-hidden="true"
          />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {!isLoading && (data?.alerts.length ?? 0) === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <PanelState
                description="Quando houver estoque baixo, orçamento parado ou outro ponto importante, ele aparecerá aqui."
                title="Nenhum alerta importante agora"
              />
            </div>
          ) : null}

          {!isLoading
            ? data?.alerts.map((alert) => (
                <article
                  className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                  key={`${alert.type}-${alert.title}`}
                >
                  <p className="text-sm font-medium text-white">
                    {alert.title}
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    {alert.detail}
                  </p>
                </article>
              ))
            : null}
        </div>
      </section>
    </>
  );
}
