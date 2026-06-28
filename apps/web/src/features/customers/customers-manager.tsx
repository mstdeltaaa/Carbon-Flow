"use client";

import {
  CalendarDays,
  CircleDollarSign,
  FileText,
  History,
  Loader2,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserRound,
  UsersRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TableStateRow } from "@/components/ui/table-state-row";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

type SaleStatus = "completed" | "cancelled" | "refunded";

type CustomerSummary = {
  budgetsCount: number;
  estimatedProfit: number;
  lastSaleAt: string | null;
  openBudgetsCount: number;
  salesCount: number;
  totalSpent: number;
};

type Customer = {
  id: string;
  companyId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  summary: CustomerSummary;
};

type CustomerBudgetHistory = {
  createdAt: string;
  id: string;
  numberLabel: string;
  status: BudgetStatus;
  totalAmount: number;
  validUntil: string | null;
};

type CustomerSaleHistory = {
  createdAt: string;
  estimatedProfit: number;
  id: string;
  numberLabel: string;
  soldAt: string;
  status: SaleStatus;
  totalAmount: number;
};

type CustomerHistory = {
  budgets: CustomerBudgetHistory[];
  customer: Customer;
  sales: CustomerSaleHistory[];
  summary: CustomerSummary;
};

type CustomerFormState = {
  address: string;
  email: string;
  name: string;
  notes: string;
  phone: string;
};

type CustomersManagerProps = {
  companyId: string;
};

const emptyForm: CustomerFormState = {
  address: "",
  email: "",
  name: "",
  notes: "",
  phone: ""
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const budgetStatusLabels: Record<BudgetStatus, string> = {
  approved: "Aprovado",
  cancelled: "Cancelado",
  converted: "Convertido",
  draft: "Rascunho",
  expired: "Expirado",
  rejected: "Rejeitado",
  sent: "Enviado"
};

const saleStatusLabels: Record<SaleStatus, string> = {
  cancelled: "Cancelada",
  completed: "Concluida",
  refunded: "Estornada"
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

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const normalizedValue = value.includes("T") ? value : `${value}T00:00:00`;

  return dateFormatter.format(new Date(normalizedValue));
}

function hasMainContact(customer: Customer) {
  return Boolean(customer.phone || customer.email);
}

export function CustomersManager({ companyId }: CustomersManagerProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );

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

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const data = await request<Customer[]>("/customers");
      setCustomers(data);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return customers;
    }

    return customers.filter((customer) => {
      return [
        customer.name,
        customer.phone ?? "",
        customer.email ?? "",
        customer.address ?? "",
        customer.notes ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [customers, search]);

  const withContactCount = customers.filter(hasMainContact).length;
  const buyingCustomersCount = customers.filter(
    (customer) => customer.summary.salesCount > 0
  ).length;
  const totalSpent = customers.reduce(
    (total, customer) => total + customer.summary.totalSpent,
    0
  );
  function updateField(field: keyof CustomerFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      address: customer.address ?? "",
      email: customer.email ?? "",
      name: customer.name,
      notes: customer.notes ?? "",
      phone: customer.phone ?? ""
    });
    setMessage(null);
  }

  function buildPayload() {
    return {
      address: form.address.trim() || null,
      email: form.email.trim() || null,
      name: form.name.trim(),
      notes: form.notes.trim() || null,
      phone: form.phone.trim() || null
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = buildPayload();
      const saved = editingId
        ? await request<Customer>(`/customers/${editingId}`, {
            body: JSON.stringify(payload),
            method: "PATCH"
          })
        : await request<Customer>("/customers", {
            body: JSON.stringify(payload),
            method: "POST"
          });

      setCustomers((current) => {
        const next = editingId
          ? current.map((customer) =>
              customer.id === saved.id ? saved : customer
            )
          : [...current, saved];

        return [...next].sort((a, b) => a.name.localeCompare(b.name));
      });

      resetForm();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCustomer(customer: Customer) {
    const shouldRemove = window.confirm(`Excluir ${customer.name}?`);

    if (!shouldRemove) {
      return;
    }

    setMessage(null);

    try {
      await request<{ id: string }>(`/customers/${customer.id}`, {
        method: "DELETE"
      });
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      if (selectedCustomerId === customer.id) {
        setSelectedCustomerId(null);
        setHistory(null);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível excluir."
      );
    }
  }

  async function loadCustomerHistory(customer: Customer) {
    setSelectedCustomerId(customer.id);
    setIsHistoryLoading(true);
    setHistoryMessage(null);
    setMessage(null);

    try {
      const data = await request<CustomerHistory>(
        `/customers/${customer.id}/history`
      );
      setHistory(data);
    } catch (error) {
      setHistory(null);
      setHistoryMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o histórico."
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Relacionamento comercial
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Clientes
          </h1>
        </div>
        <Button onClick={resetForm} type="button" variant="secondary">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo cliente
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Clientes</p>
            <UsersRound
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {customers.length}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Com contato</p>
            <Phone className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {withContactCount}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Compradores</p>
            <History className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {buyingCustomersCount}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Total vendido</p>
            <CircleDollarSign
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white sm:text-xl xl:text-2xl">
            {currencyFormatter.format(totalSpent)}
          </p>
        </article>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[0.82fr_1.18fr]">
        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                {editingId ? "Editar cliente" : "Novo cliente"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Dados de contato e entrega
              </p>
            </div>
            {editingId ? (
              <button
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                onClick={resetForm}
                title="Limpar edição"
                type="button"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm text-white">
              Nome
              <input
                className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Maria Silva"
                required
                type="text"
                value={form.name}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Telefone
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="(11) 99999-9999"
                  type="tel"
                  value={form.phone}
                />
              </label>

              <label className="grid gap-2 text-sm text-white">
                E-mail
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="cliente@email.com"
                  type="email"
                  value={form.email}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-white">
              Endereço
              <input
                className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="Rua, número, bairro, cidade"
                type="text"
                value={form.address}
              />
            </label>

            <label className="grid gap-2 text-sm text-white">
              Observacoes
              <textarea
                className="min-h-28 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 py-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Preferencias, restricoes, detalhes de entrega"
                value={form.notes}
              />
            </label>

            {message ? (
              <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
                {message}
              </p>
            ) : null}

            <Button disabled={isSaving} type="submit">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {editingId ? "Salvar alterações" : "Salvar cliente"}
            </Button>
          </form>
        </section>

        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Lista de clientes
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {filteredCustomers.length} registros
              </p>
            </div>
            <label className="relative block sm:w-72">
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

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="py-3 pr-4 font-medium">Cliente</th>
                  <th className="py-3 pr-4 font-medium">Contato</th>
                  <th className="py-3 pr-4 font-medium">Histórico</th>
                  <th className="py-3 pr-4 font-medium">Endereço</th>
                  <th className="py-3 pr-4 font-medium">Cadastro</th>
                  <th className="py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <TableStateRow
                    colSpan={6}
                    isLoading
                    title="Carregando clientes"
                  />
                ) : null}

                {!isLoading && filteredCustomers.length === 0 ? (
                  <TableStateRow
                    colSpan={6}
                    description="Cadastre clientes para acompanhar orçamentos, vendas e valores gastos."
                    title="Nenhum cliente encontrado"
                  />
                ) : null}

                {!isLoading
                  ? filteredCustomers.map((customer) => (
                      <tr
                        className={
                          selectedCustomerId === customer.id
                            ? "bg-[rgb(159_243_196/0.04)]"
                            : undefined
                        }
                        key={customer.id}
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(159_243_196/0.12)] text-[var(--primary)]">
                              <UserRound
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-white">
                                {customer.name}
                              </p>
                              <p className="mt-1 max-w-xs truncate text-xs text-[var(--muted-foreground)]">
                                {customer.notes ?? "Sem observações"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="grid gap-1 text-[var(--muted-foreground)]">
                            <span>{customer.phone ?? "Sem telefone"}</span>
                            <span>{customer.email ?? "Sem e-mail"}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="grid gap-1">
                            <span className="font-medium text-white">
                              {currencyFormatter.format(
                                customer.summary.totalSpent
                              )}
                            </span>
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {customer.summary.salesCount} vendas /{" "}
                              {customer.summary.budgetsCount} orçamentos
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          <p className="max-w-xs truncate">
                            {customer.address ?? "-"}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          {formatDate(customer.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                              onClick={() => void loadCustomerHistory(customer)}
                              title="Ver histórico"
                              type="button"
                            >
                              <History className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                              onClick={() => editCustomer(customer)}
                              title="Editar"
                              type="button"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                              onClick={() => void removeCustomer(customer)}
                              title="Excluir"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedCustomerId ? (
        <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Histórico comercial
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                {history?.customer.name ?? "Cliente selecionado"}
              </h2>
            </div>

            {history ? (
              <Button
                onClick={() => void loadCustomerHistory(history.customer)}
                type="button"
                variant="secondary"
              >
                {isHistoryLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <History className="h-4 w-4" aria-hidden="true" />
                )}
                Atualizar
              </Button>
            ) : null}
          </div>

          {isHistoryLoading ? (
            <div className="mt-6 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-6 text-center text-sm text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Carregando histórico
              </span>
            </div>
          ) : null}

          {!isHistoryLoading && historyMessage ? (
            <div className="mt-6 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 text-sm text-[var(--muted-foreground)]">
              {historyMessage}
            </div>
          ) : null}

          {!isHistoryLoading && history ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Vendas
                    </p>
                    <CircleDollarSign
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {history.summary.salesCount}
                  </p>
                </article>
                <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Valor gasto
                    </p>
                    <CircleDollarSign
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {currencyFormatter.format(history.summary.totalSpent)}
                  </p>
                </article>
                <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Lucro estimado
                    </p>
                    <CircleDollarSign
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {currencyFormatter.format(history.summary.estimatedProfit)}
                  </p>
                </article>
                <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Orçamentos abertos
                    </p>
                    <FileText
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {history.summary.openBudgetsCount}
                  </p>
                </article>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Orçamentos
                      </h3>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {history.budgets.length} registros
                      </p>
                    </div>
                    <FileText
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                          <th className="py-3 pr-3 font-medium">Número</th>
                          <th className="py-3 pr-3 font-medium">Status</th>
                          <th className="py-3 pr-3 font-medium">Validade</th>
                          <th className="py-3 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {history.budgets.length === 0 ? (
                          <tr>
                            <td
                              className="py-6 text-center text-[var(--muted-foreground)]"
                              colSpan={4}
                            >
                              Nenhum orçamento para este cliente
                            </td>
                          </tr>
                        ) : null}

                        {history.budgets.map((budget) => (
                          <tr key={budget.id}>
                            <td className="py-3 pr-3 font-medium text-white">
                              {budget.numberLabel}
                            </td>
                            <td className="py-3 pr-3 text-[var(--muted-foreground)]">
                              {budgetStatusLabels[budget.status]}
                            </td>
                            <td className="py-3 pr-3 text-[var(--muted-foreground)]">
                              <span className="inline-flex items-center gap-2">
                                <CalendarDays
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                {formatOptionalDate(budget.validUntil)}
                              </span>
                            </td>
                            <td className="py-3 text-right text-white">
                              {currencyFormatter.format(budget.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Vendas
                      </h3>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {history.sales.length} registros
                      </p>
                    </div>
                    <CircleDollarSign
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                          <th className="py-3 pr-3 font-medium">Número</th>
                          <th className="py-3 pr-3 font-medium">Status</th>
                          <th className="py-3 pr-3 font-medium">Data</th>
                          <th className="py-3 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {history.sales.length === 0 ? (
                          <tr>
                            <td
                              className="py-6 text-center text-[var(--muted-foreground)]"
                              colSpan={4}
                            >
                              Nenhuma venda para este cliente
                            </td>
                          </tr>
                        ) : null}

                        {history.sales.map((sale) => (
                          <tr key={sale.id}>
                            <td className="py-3 pr-3 font-medium text-white">
                              {sale.numberLabel}
                            </td>
                            <td className="py-3 pr-3 text-[var(--muted-foreground)]">
                              {saleStatusLabels[sale.status]}
                            </td>
                            <td className="py-3 pr-3 text-[var(--muted-foreground)]">
                              <span className="inline-flex items-center gap-2">
                                <CalendarDays
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                {formatOptionalDate(sale.soldAt)}
                              </span>
                            </td>
                            <td className="py-3 text-right text-white">
                              {currencyFormatter.format(sale.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
