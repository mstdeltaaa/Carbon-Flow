"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  WalletCards,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { TableStateRow } from "@/components/ui/table-state-row";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FinancialTransactionType = "income" | "expense";
type FinancialTransactionStatus = "pending" | "paid" | "cancelled";

type FinancialTransaction = {
  amount: number;
  category: string;
  companyId: string;
  createdAt: string;
  createdBy: string | null;
  description: string;
  dueDate: string | null;
  id: string;
  paidAt: string | null;
  sourceId: string | null;
  sourceType: string;
  status: FinancialTransactionStatus;
  transactionDate: string;
  type: FinancialTransactionType;
  updatedAt: string;
};

type FinanceSummary = {
  byCategory: Array<{
    amount: number;
    category: string;
    count: number;
    type: FinancialTransactionType;
  }>;
  period: {
    from: string;
    to: string;
  };
  totals: {
    balance: number;
    cancelledCount: number;
    paidExpense: number;
    paidIncome: number;
    pendingExpense: number;
    pendingIncome: number;
    transactionCount: number;
  };
};

type FinanceManagerProps = {
  companyId: string;
};

type FinanceFormState = {
  amount: string;
  category: string;
  description: string;
  dueDate: string;
  status: "paid" | "pending";
  transactionDate: string;
  type: FinancialTransactionType;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR");

const statusLabels: Record<FinancialTransactionStatus, string> = {
  cancelled: "Cancelado",
  paid: "Pago",
  pending: "Pendente",
};

const typeLabels: Record<FinancialTransactionType, string> = {
  expense: "Despesa",
  income: "Receita",
};

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

function getInitialForm(): FinanceFormState {
  return {
    amount: "",
    category: "Geral",
    description: "",
    dueDate: "",
    status: "paid",
    transactionDate: toInputDate(new Date()),
    type: "expense",
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

function parseDecimal(value: string) {
  return Number(value.replace(",", "."));
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(
    value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`),
  );
}

function getStatusClass(status: FinancialTransactionStatus) {
  if (status === "paid") {
    return "bg-[rgb(159_243_196/0.12)] text-[var(--primary)]";
  }

  if (status === "pending") {
    return "bg-[rgb(245_158_11/0.14)] text-[rgb(251_191_36)]";
  }

  return "bg-[var(--destructive-soft)] text-[var(--destructive-text)]";
}

function getTypeClass(type: FinancialTransactionType) {
  return type === "income"
    ? "text-[var(--primary)]"
    : "text-[var(--destructive-text)]";
}

export function FinanceManager({ companyId }: FinanceManagerProps) {
  const initialPeriod = useMemo(() => getCurrentMonthPeriod(), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FinanceFormState>(() => getInitialForm());
  const [from, setFrom] = useState(initialPeriod.from);
  const [isCancellingId, setIsCancellingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPayingId, setIsPayingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [to, setTo] = useState(initialPeriod.to);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const formSectionRef = useRef<HTMLElement | null>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
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
          ...init?.headers,
        },
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar o financeiro."),
        );
      }

      return payload as T;
    },
    [companyId],
  );

  const queryString = useMemo(() => {
    return new URLSearchParams({ from, to }).toString();
  }, [from, to]);

  const loadFinance = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const [transactionData, summaryData] = await Promise.all([
        request<FinancialTransaction[]>(`/finance?${queryString}`),
        request<FinanceSummary>(`/finance/summary?${queryString}`),
      ]);

      setTransactions(transactionData);
      setSummary(summaryData);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o financeiro.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [queryString, request]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return transactions;
    }

    return transactions.filter((transaction) => {
      return [
        transaction.category,
        transaction.description,
        transaction.sourceType,
        statusLabels[transaction.status],
        typeLabels[transaction.type],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [search, transactions]);

  const totals = summary?.totals ?? {
    balance: 0,
    cancelledCount: 0,
    paidExpense: 0,
    paidIncome: 0,
    pendingExpense: 0,
    pendingIncome: 0,
    transactionCount: 0,
  };

  function updateField<K extends keyof FinanceFormState>(
    field: K,
    value: FinanceFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(getInitialForm());
    setMessage(null);
  }

  function scrollToForm() {
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function createTransaction() {
    resetForm();
    scrollToForm();
  }

  function editTransaction(transaction: FinancialTransaction) {
    if (transaction.sourceType !== "manual") {
      setMessage(
        "Lançamentos gerados por venda devem ser alterados pela venda.",
      );
      return;
    }

    if (transaction.status === "cancelled") {
      setMessage("Lançamentos cancelados não podem ser editados.");
      return;
    }

    setEditingId(transaction.id);
    setForm({
      amount: String(transaction.amount),
      category: transaction.category,
      description: transaction.description,
      dueDate: transaction.dueDate ?? "",
      status: transaction.status === "paid" ? "paid" : "pending",
      transactionDate: transaction.transactionDate,
      type: transaction.type,
    });
    setMessage(null);
    scrollToForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const amount = parseDecimal(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Informe um valor maior que zero.");
      setIsSaving(false);
      return;
    }

    try {
      await request<FinancialTransaction>(
        editingId ? `/finance/${editingId}` : "/finance",
        {
          body: JSON.stringify({
            amount,
            category: form.category,
            description: form.description,
            dueDate: form.dueDate || undefined,
            status: form.status,
            transactionDate: form.transactionDate,
            type: form.type,
          }),
          method: editingId ? "PATCH" : "POST",
        },
      );

      const successMessage = editingId
        ? "Lançamento financeiro atualizado."
        : "Lançamento financeiro salvo.";

      resetForm();
      setMessage(successMessage);
      await loadFinance();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o lançamento.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelTransaction(transaction: FinancialTransaction) {
    setIsCancellingId(transaction.id);
    setMessage(null);

    try {
      await request<FinancialTransaction>(`/finance/${transaction.id}/cancel`, {
        method: "POST",
      });
      setMessage("Lançamento cancelado.");
      await loadFinance();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível cancelar o lançamento.",
      );
    } finally {
      setIsCancellingId(null);
    }
  }

  async function markTransactionAsPaid(transaction: FinancialTransaction) {
    setIsPayingId(transaction.id);
    setMessage(null);

    try {
      await request<FinancialTransaction>(
        `/finance/${transaction.id}/mark-paid`,
        {
          method: "POST",
        },
      );
      setMessage("Lançamento marcado como pago.");
      await loadFinance();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível marcar o lançamento como pago.",
      );
    } finally {
      setIsPayingId(null);
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-foreground)]">
            Fluxo de caixa
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Financeiro
          </h1>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={createTransaction}
          type="button"
          variant="secondary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo lançamento
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">Receitas</p>
            <ArrowUpCircle
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(totals.paidIncome)}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">Despesas</p>
            <ArrowDownCircle
              className="h-4 w-4 text-[var(--destructive-text)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(totals.paidExpense)}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">Saldo</p>
            <CircleDollarSign
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(totals.balance)}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">Pendente</p>
            <CalendarRange
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(
              totals.pendingIncome - totals.pendingExpense,
            )}
          </p>
        </article>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Período</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Filtre lançamentos e resumo financeiro
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-2 text-xs text-white">
              De
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                onChange={(event) => setFrom(event.target.value)}
                type="date"
                value={from}
              />
            </label>
            <label className="grid gap-2 text-xs text-white">
              Até
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                onChange={(event) => setTo(event.target.value)}
                type="date"
                value={to}
              />
            </label>
            <Button
              className="self-end"
              onClick={() => void loadFinance()}
              type="button"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Atualizar
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <section
          className="min-w-0 scroll-mt-24 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
          id="finance-form"
          ref={formSectionRef}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">
                {editingId ? "Editar lançamento" : "Lançamento manual"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Receitas e despesas fora das vendas
              </p>
            </div>
            {editingId ? (
              <button
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                onClick={resetForm}
                title="Cancelar edição"
                type="button"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <WalletCards
                className="h-5 w-5 shrink-0 text-[var(--primary)]"
                aria-hidden="true"
              />
            )}
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Tipo
                <select
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField(
                      "type",
                      event.target.value as FinancialTransactionType,
                    )
                  }
                  value={form.type}
                >
                  <option className="bg-[#101314] text-white" value="expense">
                    Despesa
                  </option>
                  <option className="bg-[#101314] text-white" value="income">
                    Receita
                  </option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-white">
                Status
                <select
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField(
                      "status",
                      event.target.value as "paid" | "pending",
                    )
                  }
                  value={form.status}
                >
                  <option className="bg-[#101314] text-white" value="paid">
                    Pago
                  </option>
                  <option className="bg-[#101314] text-white" value="pending">
                    Pendente
                  </option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm text-white">
              Descrição
              <input
                className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Compra de matéria-prima"
                required
                type="text"
                value={form.description}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Categoria
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("category", event.target.value)
                  }
                  placeholder="Insumos"
                  required
                  type="text"
                  value={form.category}
                />
              </label>
              <label className="grid gap-2 text-sm text-white">
                Valor
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  min="0.01"
                  onChange={(event) =>
                    updateField("amount", event.target.value)
                  }
                  placeholder="0,00"
                  required
                  step="0.01"
                  type="number"
                  value={form.amount}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Data
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("transactionDate", event.target.value)
                  }
                  required
                  type="date"
                  value={form.transactionDate}
                />
              </label>
              <label className="grid gap-2 text-sm text-white">
                Vencimento
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("dueDate", event.target.value)
                  }
                  type="date"
                  value={form.dueDate}
                />
              </label>
            </div>

            {message ? (
              <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">
                {message}
              </p>
            ) : null}

            <Button disabled={isSaving} type="submit">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {editingId ? "Salvar alterações" : "Salvar lançamento"}
            </Button>
          </form>
        </section>

        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Movimentações
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {filteredTransactions.length} registros
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

          <div className="mt-5 max-w-full overflow-x-auto rounded-md">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="py-3 pr-4 font-medium">Data</th>
                  <th className="py-3 pr-4 font-medium">Descrição</th>
                  <th className="py-3 pr-4 font-medium">Categoria</th>
                  <th className="py-3 pr-4 font-medium">Tipo</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Valor</th>
                  <th className="py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <TableStateRow
                    colSpan={7}
                    isLoading
                    title="Carregando financeiro"
                  />
                ) : null}

                {!isLoading && filteredTransactions.length === 0 ? (
                  <TableStateRow
                    colSpan={7}
                    description="Registre uma receita ou despesa manual, ou crie uma venda para gerar receita automaticamente."
                    title="Nenhum lançamento encontrado"
                  />
                ) : null}

                {!isLoading
                  ? filteredTransactions.map((transaction) => {
                      const canManage =
                        transaction.sourceType === "manual" &&
                        transaction.status !== "cancelled";

                      return (
                        <tr key={transaction.id}>
                          <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                            {formatDate(transaction.transactionDate)}
                          </td>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-white">
                              {transaction.description}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                              {transaction.sourceType === "sale"
                                ? "Gerado por venda"
                                : "Lançamento manual"}
                            </p>
                          </td>
                          <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                            {transaction.category}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={[
                                "font-medium",
                                getTypeClass(transaction.type),
                              ].join(" ")}
                            >
                              {typeLabels[transaction.type]}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={[
                                "rounded-md px-2 py-1 text-xs",
                                getStatusClass(transaction.status),
                              ].join(" ")}
                            >
                              {statusLabels[transaction.status]}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-white">
                            {currencyFormatter.format(transaction.amount)}
                          </td>
                          <td className="py-3">
                            <div className="flex justify-end gap-2">
                              {canManage ? (
                                <>
                                  <button
                                    className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                                    onClick={() => editTransaction(transaction)}
                                    title="Editar lançamento"
                                    type="button"
                                  >
                                    <Pencil
                                      className="h-4 w-4"
                                      aria-hidden="true"
                                    />
                                  </button>
                                  {transaction.status === "pending" ? (
                                    <button
                                      className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                                      disabled={isPayingId === transaction.id}
                                      onClick={() =>
                                        void markTransactionAsPaid(transaction)
                                      }
                                      title="Marcar como pago"
                                      type="button"
                                    >
                                      {isPayingId === transaction.id ? (
                                        <Loader2
                                          className="h-4 w-4 animate-spin"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <CheckCircle2
                                          className="h-4 w-4"
                                          aria-hidden="true"
                                        />
                                      )}
                                    </button>
                                  ) : null}
                                  <button
                                    className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--destructive-soft)] hover:text-[var(--destructive-text)]"
                                    disabled={isCancellingId === transaction.id}
                                    onClick={() =>
                                      void cancelTransaction(transaction)
                                    }
                                    title="Cancelar lançamento"
                                    type="button"
                                  >
                                    {isCancellingId === transaction.id ? (
                                      <Loader2
                                        className="h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <RotateCcw
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-[var(--muted-foreground)]">
                                  -
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
