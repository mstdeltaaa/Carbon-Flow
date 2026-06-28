"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Send,
  ShoppingCart,
  Trash2
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TableStateRow } from "@/components/ui/table-state-row";
import { canConvertBudgets } from "@/lib/access-control";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Product = {
  id: string;
  name: string;
  salePrice: number;
  estimatedCost: number;
};

type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

type BudgetItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  estimatedCost: number;
};

type Budget = {
  id: string;
  customerId: string | null;
  customer: Customer | null;
  number: number;
  numberLabel: string;
  status: BudgetStatus;
  validUntil: string | null;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: BudgetItem[];
};

type Sale = {
  id: string;
  numberLabel: string;
};

type BudgetFormItem = {
  productId: string;
  quantity: string;
  unitPrice: string;
};

type BudgetFormState = {
  customerId: string;
  discountAmount: string;
  items: BudgetFormItem[];
  notes: string;
  status: BudgetStatus;
  validUntil: string;
};

type BudgetsManagerProps = {
  companyId: string;
  role: string | null;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const statusLabels: Record<BudgetStatus, string> = {
  approved: "Aprovado",
  cancelled: "Cancelado",
  converted: "Convertido",
  draft: "Rascunho",
  expired: "Expirado",
  rejected: "Rejeitado",
  sent: "Enviado"
};

const statusOptions: BudgetStatus[] = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
  "cancelled"
];

const emptyItem: BudgetFormItem = {
  productId: "",
  quantity: "1",
  unitPrice: "0"
};

const emptyForm: BudgetFormState = {
  customerId: "",
  discountAmount: "0",
  items: [emptyItem],
  notes: "",
  status: "draft",
  validUntil: ""
};

function cloneEmptyItem(): BudgetFormItem {
  return { ...emptyItem };
}

function cloneEmptyForm(): BudgetFormState {
  return {
    ...emptyForm,
    items: [cloneEmptyItem()]
  };
}

function parseDecimal(value: string, fallback = 0) {
  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function getStatusClass(status: BudgetStatus) {
  if (status === "approved" || status === "converted") {
    return "bg-[rgb(159_243_196/0.12)] text-[var(--primary)]";
  }

  if (status === "rejected" || status === "cancelled" || status === "expired") {
    return "bg-[rgb(255_107_107/0.12)] text-[#ff8d8d]";
  }

  return "bg-[var(--secondary)] text-[var(--muted-foreground)]";
}

export function BudgetsManager({ companyId, role }: BudgetsManagerProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormState>(() => cloneEmptyForm());
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConvertingId, setIsConvertingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const canConvert = canConvertBudgets(role);

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    const [customersResult, productsResult, budgetsResult] =
      await Promise.allSettled([
        request<Customer[]>("/customers"),
        request<Product[]>("/products"),
        request<Budget[]>("/budgets")
      ]);

    if (customersResult.status === "fulfilled") {
      setCustomers(customersResult.value);
    }

    if (productsResult.status === "fulfilled") {
      setProducts(productsResult.value);
    }

    if (budgetsResult.status === "fulfilled") {
      setBudgets(budgetsResult.value);
    }

    const errors = [customersResult, productsResult, budgetsResult]
      .filter((result) => result.status === "rejected")
      .map((result) =>
        result.status === "rejected" && result.reason instanceof Error
          ? result.reason.message
          : "Não foi possível carregar todos os dados."
      );

    if (errors.length > 0) {
      setMessage(errors.join(" "));
    }

    setIsLoading(false);
  }, [request]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredBudgets = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return budgets;
    }

    return budgets.filter((budget) => {
      return [
        budget.numberLabel,
        statusLabels[budget.status],
        budget.customer?.name ?? "",
        budget.items.map((item) => item.productName).join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [budgets, search]);

  const preview = useMemo(() => {
    const subtotalAmount = roundMoney(
      form.items.reduce((total, item) => {
        const quantity = parseDecimal(item.quantity);
        const unitPrice = parseDecimal(item.unitPrice);

        if (quantity <= 0 || unitPrice < 0 || !item.productId) {
          return total;
        }

        return total + quantity * unitPrice;
      }, 0)
    );
    const discountAmount = roundMoney(parseDecimal(form.discountAmount));

    return {
      discountAmount,
      itemCount: form.items.filter((item) => item.productId).length,
      subtotalAmount,
      totalAmount: roundMoney(Math.max(subtotalAmount - discountAmount, 0))
    };
  }, [form]);

  const openBudgets = budgets.filter((budget) =>
    ["draft", "sent"].includes(budget.status)
  ).length;
  const approvedBudgets = budgets.filter(
    (budget) => budget.status === "approved"
  ).length;
  const totalPipeline = budgets
    .filter((budget) => ["draft", "sent", "approved"].includes(budget.status))
    .reduce((total, budget) => total + budget.totalAmount, 0);

  function updateField(
    field: keyof Omit<BudgetFormState, "items">,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateItem(
    index: number,
    field: keyof BudgetFormItem,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        const nextItem = {
          ...item,
          [field]: value
        };

        if (field === "productId") {
          const product = products.find((currentProduct) => currentProduct.id === value);
          nextItem.unitPrice = product ? String(product.salePrice) : "0";
        }

        return nextItem;
      })
    }));
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      items: [...current.items, cloneEmptyItem()]
    }));
  }

  function removeItem(index: number) {
    setForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [cloneEmptyItem()]
          : current.items.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(cloneEmptyForm());
    setMessage(null);
  }

  function editBudget(budget: Budget) {
    if (budget.status === "converted") {
      setMessage(
        `${budget.numberLabel} já virou venda e não pode ser editado como orçamento.`
      );
      return;
    }

    setEditingId(budget.id);
    setForm({
      customerId: budget.customerId ?? "",
      discountAmount: String(budget.discountAmount),
      items: budget.items.length
        ? budget.items.map((item) => ({
            productId: item.productId ?? "",
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice)
          }))
        : [cloneEmptyItem()],
      notes: budget.notes ?? "",
      status: budget.status,
      validUntil: budget.validUntil ?? ""
    });
    setMessage(null);
  }

  function buildPayload() {
    const cleanedItems = form.items
      .map((item) => {
        const product = products.find((current) => current.id === item.productId);
        const quantity = parseDecimal(item.quantity);
        const unitPrice = parseDecimal(item.unitPrice);

        if (!product || quantity <= 0 || unitPrice < 0) {
          return null;
        }

        return {
          productId: product.id,
          quantity,
          unitPrice
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (cleanedItems.length === 0) {
      throw new Error("Adicione pelo menos um produto no orçamento.");
    }

    const productIds = cleanedItems.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
      throw new Error("Use cada produto apenas uma vez no orçamento.");
    }

    if (preview.discountAmount > preview.subtotalAmount) {
      throw new Error("O desconto não pode ser maior que o subtotal.");
    }

    return {
      customerId: form.customerId || null,
      discountAmount: preview.discountAmount,
      items: cleanedItems,
      notes: form.notes.trim() || null,
      status: form.status,
      validUntil: form.validUntil || null
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = buildPayload();
      const saved = editingId
        ? await request<Budget>(`/budgets/${editingId}`, {
            body: JSON.stringify(payload),
            method: "PATCH"
          })
        : await request<Budget>("/budgets", {
            body: JSON.stringify({
              ...payload,
              status: undefined
            }),
            method: "POST"
          });

      setBudgets((current) => {
        const next = editingId
          ? current.map((budget) => (budget.id === saved.id ? saved : budget))
          : [saved, ...current];

        return [...next].sort((a, b) => b.number - a.number);
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

  async function removeBudget(budget: Budget) {
    if (budget.status === "converted") {
      setMessage(
        `${budget.numberLabel} já virou venda e não pode ser excluído como orçamento.`
      );
      return;
    }

    const shouldRemove = window.confirm(`Excluir ${budget.numberLabel}?`);

    if (!shouldRemove) {
      return;
    }

    setMessage(null);

    try {
      await request<{ id: string }>(`/budgets/${budget.id}`, {
        method: "DELETE"
      });
      setBudgets((current) => current.filter((item) => item.id !== budget.id));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível excluir."
      );
    }
  }

  async function approveBudget(budget: Budget) {
    setIsApprovingId(budget.id);
    setMessage(null);

    try {
      const saved = await request<Budget>(`/budgets/${budget.id}`, {
        body: JSON.stringify({ status: "approved" }),
        method: "PATCH"
      });

      setBudgets((current) =>
        current.map((item) => (item.id === saved.id ? saved : item))
      );
      setMessage(`${saved.numberLabel} aprovado. Agora ele pode virar venda.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível aprovar."
      );
    } finally {
      setIsApprovingId(null);
    }
  }

  async function convertBudget(budget: Budget) {
    const shouldConvert = window.confirm(
      `Converter ${budget.numberLabel} em venda e baixar o estoque?`
    );

    if (!shouldConvert) {
      return;
    }

    setIsConvertingId(budget.id);
    setMessage(null);

    try {
      const sale = await request<Sale>(`/sales/from-budget/${budget.id}`, {
        method: "POST"
      });

      setBudgets((current) =>
        current.map((item) =>
          item.id === budget.id ? { ...item, status: "converted" } : item
        )
      );
      setMessage(`Venda ${sale.numberLabel} criada e estoque atualizado.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível converter."
      );
    } finally {
      setIsConvertingId(null);
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Comercial e vendas
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Orçamentos
          </h1>
        </div>
        <Button onClick={resetForm} type="button" variant="secondary">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo orçamento
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Orçamentos</p>
            <FileText
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {budgets.length}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Em aberto</p>
            <Send className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {openBudgets}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Aprovados</p>
            <CheckCircle2
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {approvedBudgets}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Pipeline</p>
            <CircleDollarSign
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {currencyFormatter.format(totalPipeline)}
          </p>
        </article>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[0.92fr_1.08fr]">
        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                {editingId ? "Editar orçamento" : "Novo orçamento"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Cliente, produtos e validade
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Cliente
                <select
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("customerId", event.target.value)
                  }
                  value={form.customerId}
                >
                  <option className="bg-[#101314] text-white" value="">
                    Sem cliente
                  </option>
                  {customers.map((customer) => (
                    <option
                      className="bg-[#101314] text-white"
                      key={customer.id}
                      value={customer.id}
                    >
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-white">
                Validade
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("validUntil", event.target.value)
                  }
                  type="date"
                  value={form.validUntil}
                />
              </label>
            </div>

            {editingId ? (
              <label className="grid gap-2 text-sm text-white">
                Status
                <select
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("status", event.target.value)
                  }
                  value={form.status}
                >
                  {statusOptions.map((status) => (
                    <option
                      className="bg-[#101314] text-white"
                      key={status}
                      value={status}
                    >
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Produtos</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {products.length} disponíveis / {preview.itemCount} no orçamento
                  </p>
                </div>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                  onClick={addItem}
                  title="Adicionar produto"
                  type="button"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {products.length === 0 ? (
                <p className="mt-4 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.68)] p-3 text-sm text-[var(--muted-foreground)]">
                  Cadastre produtos antes de montar orçamentos.
                </p>
              ) : null}

              <div className="mt-4 grid gap-3">
                {form.items.map((item, index) => {
                  const quantity = parseDecimal(item.quantity);
                  const unitPrice = parseDecimal(item.unitPrice);
                  const lineTotal = roundMoney(quantity * unitPrice);

                  return (
                    <div
                      className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.68)] p-3 md:grid-cols-2 2xl:grid-cols-[1.4fr_0.6fr_0.72fr_0.72fr_2.5rem] 2xl:items-end"
                      key={`${index}-${item.productId}`}
                    >
                      <label className="grid min-w-0 gap-2 text-xs text-white md:col-span-2 2xl:col-span-1">
                        Produto
                        <select
                          className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                          onChange={(event) =>
                            updateItem(index, "productId", event.target.value)
                          }
                          required
                          value={item.productId}
                        >
                          <option className="bg-[#101314] text-white" value="">
                            Selecione
                          </option>
                          {products.map((product) => (
                            <option
                              className="bg-[#101314] text-white"
                              key={product.id}
                              value={product.id}
                            >
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-xs text-white">
                        Qtd.
                        <input
                          className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                          min="0.0001"
                          onChange={(event) =>
                            updateItem(index, "quantity", event.target.value)
                          }
                          required
                          step="0.0001"
                          type="number"
                          value={item.quantity}
                        />
                      </label>

                      <label className="grid gap-2 text-xs text-white">
                        Preço
                        <input
                          className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                          min="0"
                          onChange={(event) =>
                            updateItem(index, "unitPrice", event.target.value)
                          }
                          required
                          step="0.01"
                          type="number"
                          value={item.unitPrice}
                        />
                      </label>

                      <div className="min-w-0">
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Total
                        </p>
                        <p className="mt-2 h-10 content-center truncate text-sm font-semibold text-white">
                          {currencyFormatter.format(lineTotal)}
                        </p>
                      </div>

                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white md:self-end"
                        onClick={() => removeItem(index)}
                        title="Remover produto"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Subtotal
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {currencyFormatter.format(preview.subtotalAmount)}
                </p>
              </div>
              <label className="grid gap-2 text-sm text-white">
                Desconto
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("discountAmount", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={form.discountAmount}
                />
              </label>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Total</p>
                <p className="mt-1 text-lg font-semibold text-[var(--primary)]">
                  {currencyFormatter.format(preview.totalAmount)}
                </p>
              </div>
            </div>

            <label className="grid gap-2 text-sm text-white">
              Observações
              <textarea
                className="min-h-24 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 py-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Condições comerciais, prazo de entrega, forma de pagamento"
                value={form.notes}
              />
            </label>

            {message ? (
              <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
                {message}
              </p>
            ) : null}

            <Button disabled={isSaving || products.length === 0} type="submit">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {editingId ? "Salvar alterações" : "Salvar orçamento"}
            </Button>
          </form>
        </section>

        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Lista de orçamentos
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {filteredBudgets.length} registros
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
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="py-3 pr-4 font-medium">Número</th>
                  <th className="py-3 pr-4 font-medium">Cliente</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Validade</th>
                  <th className="py-3 pr-4 font-medium">Total</th>
                  <th className="py-3 pr-4 font-medium">Itens</th>
                  <th className="py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <TableStateRow
                    colSpan={7}
                    isLoading
                    title="Carregando orçamentos"
                  />
                ) : null}

                {!isLoading && filteredBudgets.length === 0 ? (
                  <TableStateRow
                    colSpan={7}
                    description="Crie propostas profissionais e converta aprovações em vendas com baixa automática de estoque."
                    title="Nenhum orçamento encontrado"
                  />
                ) : null}

                {!isLoading
                  ? filteredBudgets.map((budget) => (
                      <tr key={budget.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-white">
                            {budget.numberLabel}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {dateFormatter.format(new Date(budget.createdAt))}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          {budget.customer?.name ?? "Sem cliente"}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={[
                              "rounded-md px-2 py-1 text-xs",
                              getStatusClass(budget.status)
                            ].join(" ")}
                          >
                            {statusLabels[budget.status]}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            {formatDate(budget.validUntil)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {currencyFormatter.format(budget.totalAmount)}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex max-w-sm flex-wrap gap-2">
                            {budget.items.slice(0, 2).map((item) => (
                              <span
                                className="rounded-md bg-[rgb(159_243_196/0.1)] px-2 py-1 text-xs text-[var(--primary)]"
                                key={item.id}
                              >
                                {item.productName}: {item.quantity}
                              </span>
                            ))}
                            {budget.items.length > 2 ? (
                              <span className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                                +{budget.items.length - 2}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <Link
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                              href={`/budgets/${budget.id}`}
                              title="Imprimir ou salvar PDF"
                            >
                              <Printer className="h-4 w-4" aria-hidden="true" />
                            </Link>
                            {["draft", "sent"].includes(budget.status) ? (
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--primary)] transition hover:bg-[rgb(159_243_196/0.12)]"
                                disabled={isApprovingId === budget.id}
                                onClick={() => void approveBudget(budget)}
                                title="Aprovar orçamento"
                                type="button"
                              >
                                {isApprovingId === budget.id ? (
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
                            {budget.status === "approved" && canConvert ? (
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--primary)] transition hover:bg-[rgb(159_243_196/0.12)]"
                                disabled={isConvertingId === budget.id}
                                onClick={() => void convertBudget(budget)}
                                title="Converter em venda"
                                type="button"
                              >
                                {isConvertingId === budget.id ? (
                                  <Loader2
                                    className="h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <ShoppingCart
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                )}
                              </button>
                            ) : null}
                            {budget.status !== "converted" ? (
                              <>
                                <button
                                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                                  onClick={() => editBudget(budget)}
                                  title="Editar"
                                  type="button"
                                >
                                  <Pencil
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </button>
                                <button
                                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                                  onClick={() => void removeBudget(budget)}
                                  title="Excluir"
                                  type="button"
                                >
                                  <Trash2
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </button>
                              </>
                            ) : null}
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
    </>
  );
}
