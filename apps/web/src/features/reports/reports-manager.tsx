"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarRange,
  Download,
  FileText,
  LineChart,
  Loader2,
  PackageCheck,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FinancialTransactionType = "income" | "expense";

type ReportsPayload = {
  finance: {
    byCategory: Array<{
      amount: number;
      category: string;
      count: number;
      paidAmount: number;
      pendingAmount: number;
      type: FinancialTransactionType;
    }>;
    totals: {
      cancelledCount: number;
      overdueCount: number;
      overduePayable: number;
      overdueReceivable: number;
      paidExpense: number;
      paidIncome: number;
      pendingExpense: number;
      pendingIncome: number;
      projectedBalance: number;
      realizedBalance: number;
      transactionCount: number;
    };
  };
  lowStock: {
    count: number;
    items: Array<{
      category: string | null;
      current: number;
      id: string;
      minimum: number;
      name: string;
      shortage: number;
      unit: string;
    }>;
  };
  period: {
    days: number;
    from: string;
    to: string;
  };
  sales: {
    averageTicket: number;
    estimatedMargin: number;
    estimatedProfit: number;
    recentSales: Array<{
      customerName: string | null;
      estimatedProfit: number;
      id: string;
      numberLabel: string;
      soldAt: string;
      totalAmount: number;
    }>;
    revenue: number;
    salesByDay: Array<{
      date: string;
      estimatedProfit: number;
      revenue: number;
      salesCount: number;
    }>;
    salesCount: number;
    topProducts: Array<{
      estimatedCost: number;
      estimatedProfit: number;
      productId: string | null;
      productName: string;
      quantity: number;
      revenue: number;
    }>;
  };
};

type ReportsManagerProps = {
  companyId: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR");

function toInputDate(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 10);
}

function getCurrentMonthPeriod() {
  const now = new Date();

  return {
    from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function getLast30DaysPeriod() {
  const now = new Date();
  const start = new Date(now);

  start.setDate(now.getDate() - 29);

  return {
    from: toInputDate(start),
    to: toInputDate(now),
  };
}

function getCurrentYearPeriod() {
  const now = new Date();

  return {
    from: toInputDate(new Date(now.getFullYear(), 0, 1)),
    to: toInputDate(new Date(now.getFullYear(), 11, 31)),
  };
}

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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(
    value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`),
  );
}

function formatPercent(value: number) {
  return `${decimalFormatter.format(value)}%`;
}

function buildReportsCsv(data: ReportsPayload) {
  const rows = [
    ["Relatório Carbon Flow"],
    [
      "Período",
      `${formatDate(data.period.from)} a ${formatDate(data.period.to)}`,
    ],
    [],
    ["Resumo"],
    ["Faturamento", data.sales.revenue],
    ["Vendas", data.sales.salesCount],
    ["Lucro estimado", data.sales.estimatedProfit],
    ["Ticket médio", data.sales.averageTicket],
    ["Margem estimada", `${data.sales.estimatedMargin}%`],
    ["Saldo realizado", data.finance.totals.realizedBalance],
    ["Saldo projetado", data.finance.totals.projectedBalance],
    [],
    ["Produtos mais vendidos"],
    ["Produto", "Quantidade", "Faturamento", "Lucro estimado"],
    ...data.sales.topProducts.map((product) => [
      product.productName,
      product.quantity,
      product.revenue,
      product.estimatedProfit,
    ]),
    [],
    ["Financeiro por categoria"],
    ["Tipo", "Categoria", "Valor", "Pago", "Pendente"],
    ...data.finance.byCategory.map((category) => [
      category.type === "income" ? "Receita" : "Despesa",
      category.category,
      category.amount,
      category.paidAmount,
      category.pendingAmount,
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(";"),
    )
    .join("\n");
}

export function ReportsManager({ companyId }: ReportsManagerProps) {
  const initialPeriod = useMemo(() => getCurrentMonthPeriod(), []);
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [from, setFrom] = useState(initialPeriod.from);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [to, setTo] = useState(initialPeriod.to);

  const request = useCallback(
    async (period: { from: string; to: string }) => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Sessão expirada. Entre novamente.");
      }

      const searchParams = new URLSearchParams(period);
      const response = await fetch(`${env.apiUrl}/reports?${searchParams}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar os relatórios."),
        );
      }

      return payload as ReportsPayload;
    },
    [companyId],
  );

  const loadReports = useCallback(
    async (period: { from: string; to: string }) => {
      setIsLoading(true);
      setMessage(null);

      try {
        const reports = await request(period);
        setData(reports);
        setFrom(reports.period.from);
        setTo(reports.period.to);
      } catch (error) {
        setData(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os relatórios.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    void loadReports(initialPeriod);
  }, [initialPeriod, loadReports]);

  const maxDailyRevenue = Math.max(
    1,
    ...(data?.sales.salesByDay.map((item) => item.revenue) ?? [0]),
  );
  const maxProductRevenue = Math.max(
    1,
    ...(data?.sales.topProducts.map((item) => item.revenue) ?? [0]),
  );
  const maxCategoryAmount = Math.max(
    1,
    ...(data?.finance.byCategory.map((item) => item.amount) ?? [0]),
  );

  function applyPeriod(period: { from: string; to: string }) {
    setFrom(period.from);
    setTo(period.to);
    void loadReports(period);
  }

  function exportCsv() {
    if (!data) {
      return;
    }

    const blob = new Blob([`\uFEFF${buildReportsCsv(data)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `carbon-flow-relatorios-${data.period.from}-${data.period.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const summaryCards = [
    {
      detail: `${data?.sales.salesCount ?? 0} venda(s) no período`,
      icon: BarChart3,
      label: "Faturamento",
      value: currencyFormatter.format(data?.sales.revenue ?? 0),
    },
    {
      detail: `${formatPercent(data?.sales.estimatedMargin ?? 0)} de margem`,
      icon: ArrowUpRight,
      label: "Lucro estimado",
      value: currencyFormatter.format(data?.sales.estimatedProfit ?? 0),
    },
    {
      detail: "Valor médio por venda",
      icon: FileText,
      label: "Ticket médio",
      value: currencyFormatter.format(data?.sales.averageTicket ?? 0),
    },
    {
      detail: "Entradas pagas menos saídas pagas",
      icon: WalletCards,
      label: "Saldo realizado",
      value: currencyFormatter.format(
        data?.finance.totals.realizedBalance ?? 0,
      ),
    },
    {
      detail: "Pago + pendente no período",
      icon: LineChart,
      label: "Saldo projetado",
      value: currencyFormatter.format(
        data?.finance.totals.projectedBalance ?? 0,
      ),
    },
    {
      detail: "Insumos abaixo do mínimo",
      icon: AlertTriangle,
      label: "Estoque baixo",
      value: String(data?.lowStock.count ?? 0),
    },
  ];

  return (
    <>
      <header className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[var(--primary)]">Relatórios</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Análise da operação
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              Vendas, lucro estimado, produtos mais vendidos, financeiro e
              estoque baixo em um só painel.
            </p>
          </div>

          <div className="grid gap-3 lg:min-w-[40rem]">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                Início
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.52)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) => setFrom(event.target.value)}
                  type="date"
                  value={from}
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                Fim
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.52)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) => setTo(event.target.value)}
                  type="date"
                  value={to}
                />
              </label>
              <Button
                className="self-end"
                disabled={isLoading}
                onClick={() => void loadReports({ from, to })}
                type="button"
              >
                {isLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Atualizar
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                onClick={() => applyPeriod(getCurrentMonthPeriod())}
                type="button"
                variant="secondary"
              >
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                Mês atual
              </Button>
              <Button
                onClick={() => applyPeriod(getLast30DaysPeriod())}
                type="button"
                variant="secondary"
              >
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                Últimos 30 dias
              </Button>
              <Button
                onClick={() => applyPeriod(getCurrentYearPeriod())}
                type="button"
                variant="secondary"
              >
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                Ano atual
              </Button>
              <Button
                disabled={!data || isLoading}
                onClick={exportCsv}
                type="button"
                variant="secondary"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </div>
      </header>

      {message ? (
        <p className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      {isLoading ? (
        <section className="flex min-h-[18rem] items-center justify-center rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-8 text-[var(--muted-foreground)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Carregando relatórios
        </section>
      ) : data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
            {summaryCards.map((card) => (
              <article
                className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
                key={card.label}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {card.label}
                  </p>
                  <card.icon
                    className="h-4 w-4 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-4 text-2xl font-semibold text-white">
                  {card.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Vendas por dia
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {formatDate(data.period.from)} a {formatDate(data.period.to)}
                </p>
              </div>
              <span className="text-sm text-[var(--muted-foreground)]">
                {data.period.days} dia(s)
              </span>
            </div>

            <div className="mt-6 overflow-x-auto">
              <div
                className="grid min-w-full items-end gap-2"
                style={{
                  gridTemplateColumns: `repeat(${data.sales.salesByDay.length}, minmax(2.25rem, 1fr))`,
                }}
              >
                {data.sales.salesByDay.map((day) => {
                  const height = Math.max(
                    6,
                    Math.round((day.revenue / maxDailyRevenue) * 100),
                  );

                  return (
                    <div className="grid gap-2" key={day.date}>
                      <div className="flex h-32 items-end rounded-md bg-[rgb(8_10_11/0.44)] px-1">
                        <div
                          className="w-full rounded-t-md bg-[var(--primary)]"
                          title={`${formatDate(day.date)}: ${currencyFormatter.format(day.revenue)}`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <p className="truncate text-center text-[10px] text-[var(--muted-foreground)]">
                        {day.date.slice(8, 10)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Produtos mais vendidos
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Ranking por faturamento
                  </p>
                </div>
                <PackageCheck
                  className="h-5 w-5 text-[var(--primary)]"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 grid gap-3">
                {data.sales.topProducts.length === 0 ? (
                  <EmptyState text="Nenhum produto vendido neste período." />
                ) : null}

                {data.sales.topProducts.map((product, index) => (
                  <article
                    className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                    key={`${product.productId ?? product.productName}-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {index + 1}. {product.productName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {quantityFormatter.format(product.quantity)}{" "}
                          unidade(s) vendida(s)
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-[var(--primary)]">
                        {currencyFormatter.format(product.revenue)}
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{
                          width: `${Math.round((product.revenue / maxProductRevenue) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      Lucro estimado:{" "}
                      <span className="text-white">
                        {currencyFormatter.format(product.estimatedProfit)}
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Financeiro por categoria
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Receitas e despesas do período
                  </p>
                </div>
                <WalletCards
                  className="h-5 w-5 text-[var(--primary)]"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 grid gap-3">
                {data.finance.byCategory.length === 0 ? (
                  <EmptyState text="Nenhum lançamento financeiro neste período." />
                ) : null}

                {data.finance.byCategory.slice(0, 10).map((category) => {
                  const isIncome = category.type === "income";

                  return (
                    <article
                      className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                      key={`${category.type}-${category.category}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {category.category}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                            {isIncome ? (
                              <ArrowUpRight
                                className="h-3.5 w-3.5 text-[var(--primary)]"
                                aria-hidden="true"
                              />
                            ) : (
                              <ArrowDownRight
                                className="h-3.5 w-3.5 text-[var(--destructive)]"
                                aria-hidden="true"
                              />
                            )}
                            {isIncome ? "Receita" : "Despesa"} ·{" "}
                            {category.count} lançamento(s)
                          </p>
                        </div>
                        <p
                          className={[
                            "shrink-0 text-sm font-semibold",
                            isIncome
                              ? "text-[var(--primary)]"
                              : "text-[var(--destructive-text)]",
                          ].join(" ")}
                        >
                          {currencyFormatter.format(category.amount)}
                        </p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
                        <div
                          className={[
                            "h-full rounded-full",
                            isIncome
                              ? "bg-[var(--primary)]"
                              : "bg-[var(--destructive)]",
                          ].join(" ")}
                          style={{
                            width: `${Math.round((category.amount / maxCategoryAmount) * 100)}%`,
                          }}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
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

              <div className="mt-5 grid gap-3">
                {data.lowStock.items.length === 0 ? (
                  <EmptyState text="Todos os insumos estão acima do estoque mínimo." />
                ) : null}

                {data.lowStock.items.map((item) => (
                  <article
                    className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {item.category ?? "Sem categoria"}
                        </p>
                      </div>
                      <span className="rounded-md bg-[rgb(239_68_68/0.14)] px-2 py-1 text-xs text-red-200">
                        Repor
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      Atual: {quantityFormatter.format(item.current)}{" "}
                      {item.unit} · mínimo:{" "}
                      {quantityFormatter.format(item.minimum)} {item.unit}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Vendas recentes
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Últimas vendas concluídas no período
                  </p>
                </div>
                <FileText
                  className="h-5 w-5 text-[var(--primary)]"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 divide-y divide-[var(--border)]">
                {data.sales.recentSales.length === 0 ? (
                  <EmptyState text="Nenhuma venda concluída neste período." />
                ) : null}

                {data.sales.recentSales.map((sale) => (
                  <div
                    className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]"
                    key={sale.id}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {sale.numberLabel}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {sale.customerName ?? "Cliente não informado"} ·{" "}
                        {formatDate(sale.soldAt)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-semibold text-[var(--primary)]">
                        {currencyFormatter.format(sale.totalAmount)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Lucro: {currencyFormatter.format(sale.estimatedProfit)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.3)] p-5 text-center text-sm text-[var(--muted-foreground)]">
      {text}
    </div>
  );
}
