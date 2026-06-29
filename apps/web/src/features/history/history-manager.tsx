"use client";

import {
  FileClock,
  FileText,
  Search,
  ShieldCheck,
  ShoppingCart,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TableStateRow } from "@/components/ui/table-state-row";
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

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const actionLabels: Record<string, string> = {
  "budget.approved": "Aprovou orçamento",
  "budget.created": "Criou orçamento",
  "budget.deleted": "Excluiu orçamento",
  "budget.updated": "Atualizou orçamento",
  "sale.cancelled": "Cancelou venda",
  "sale.created": "Criou venda direta",
  "sale.created_from_budget": "Converteu orçamento em venda"
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

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `#${String(value).padStart(6, "0")}`;
}

function getLogSummary(log: AuditLog) {
  const number = getMetadataNumber(log.metadata, "number");
  const budgetNumber = getMetadataNumber(log.metadata, "budgetNumber");

  if (log.action === "sale.created_from_budget") {
    return `${formatNumber(budgetNumber)} virou venda ${formatNumber(number)}`;
  }

  if (log.entityType === "sale") {
    return `Venda ${formatNumber(number)}`;
  }

  if (log.entityType === "budget") {
    return `Orçamento ${formatNumber(number)}`;
  }

  return log.entityType;
}

function getLogIcon(log: AuditLog) {
  if (log.entityType === "sale") {
    return ShoppingCart;
  }

  if (log.entityType === "budget") {
    return FileText;
  }

  return FileClock;
}

export function HistoryManager({ companyId, role }: HistoryManagerProps) {
  const [isLoading, setIsLoading] = useState(role === "admin");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

    if (!term) {
      return logs;
    }

    return logs.filter((log) =>
      [
        actionLabels[log.action] ?? log.action,
        getLogSummary(log),
        log.user?.fullName ?? "",
        log.user?.email ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [logs, search]);

  const saleLogs = logs.filter((log) => log.entityType === "sale").length;
  const budgetLogs = logs.filter((log) => log.entityType === "budget").length;
  const lastDayLogs = logs.filter((log) => {
    const createdAt = new Date(log.createdAt).getTime();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    return createdAt >= oneDayAgo;
  }).length;

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
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-foreground)]">
            Auditoria e seguranca
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Histórico
          </h1>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Registros</p>
            <FileClock
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {logs.length}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Vendas</p>
            <ShoppingCart
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">{saleLogs}</p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">
              Orçamentos
            </p>
            <FileText
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {budgetLogs}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Últimas 24h</p>
            <ShieldCheck
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {lastDayLogs}
          </p>
        </article>
      </section>

      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Ações importantes
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {filteredLogs.length} registros encontrados
            </p>
          </div>
          <label className="relative block sm:w-72 lg:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              className="h-10 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              type="search"
              value={search}
            />
          </label>
        </div>

        {message ? (
          <p className="mt-5 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
            {message}
          </p>
        ) : null}

        <div className="mt-5 max-w-full overflow-x-auto rounded-md">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                <th className="py-3 pr-4 font-medium">Ação</th>
                <th className="py-3 pr-4 font-medium">Registro</th>
                <th className="py-3 pr-4 font-medium">Usuário</th>
                <th className="py-3 pr-4 font-medium">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {isLoading ? (
                <TableStateRow
                  colSpan={4}
                  isLoading
                  title="Carregando histórico"
                />
              ) : null}

              {!isLoading && filteredLogs.length === 0 ? (
                <TableStateRow
                  colSpan={4}
                  description="As ações importantes da empresa aparecerão aqui para auditoria e acompanhamento."
                  title="Nenhum registro encontrado"
                />
              ) : null}

              {!isLoading
                ? filteredLogs.map((log) => {
                    const Icon = getLogIcon(log);

                    return (
                      <tr key={log.id}>
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center gap-2 text-white">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(159_243_196/0.12)] text-[var(--primary)]">
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            {actionLabels[log.action] ?? log.action}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          {getLogSummary(log)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center gap-2 text-[var(--muted-foreground)]">
                            <UserRound className="h-4 w-4" aria-hidden="true" />
                            {log.user?.fullName ?? log.user?.email ?? "-"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          {dateTimeFormatter.format(new Date(log.createdAt))}
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
