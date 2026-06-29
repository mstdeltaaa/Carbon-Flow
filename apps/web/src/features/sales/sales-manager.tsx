"use client";

import {
  CircleDollarSign,
  Download,
  Loader2,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";

import { Button } from "@/components/ui/button";
import { TableStateRow } from "@/components/ui/table-state-row";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Customer = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
};

type SaleItem = {
  estimatedUnitCost: number;
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
};

type Product = {
  estimatedCost: number;
  id: string;
  name: string;
  salePrice: number;
};

type Sale = {
  id: string;
  budgetId: string | null;
  budget: {
    id: string;
    number: number;
    numberLabel: string;
    status: string;
  } | null;
  customer: Customer | null;
  customerId: string | null;
  discountAmount: number;
  estimatedProfit: number;
  items: SaleItem[];
  number: number;
  numberLabel: string;
  soldAt: string;
  status: "completed" | "cancelled" | "refunded";
  subtotalAmount: number;
  totalAmount: number;
};

type SalesManagerProps = {
  companyId: string;
};

type SaleFormItem = {
  productId: string;
  quantity: string;
  unitPrice: string;
};

type SaleFormState = {
  customerId: string;
  discountAmount: string;
  items: SaleFormItem[];
};

const emptyItem: SaleFormItem = {
  productId: "",
  quantity: "1",
  unitPrice: "0"
};

const emptyForm: SaleFormState = {
  customerId: "",
  discountAmount: "0",
  items: [emptyItem]
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const statusLabels: Record<Sale["status"], string> = {
  cancelled: "Cancelada",
  completed: "Concluída",
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

function getStatusClass(status: Sale["status"]) {
  if (status === "completed") {
    return "bg-[rgb(159_243_196/0.12)] text-[var(--primary)]";
  }

  return "bg-[rgb(255_107_107/0.12)] text-[#ff8d8d]";
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function cloneEmptyItem(): SaleFormItem {
  return { ...emptyItem };
}

function cloneEmptyForm(): SaleFormState {
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

function formatCsvMoney(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function escapeCsvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");

  if (/[;"\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function formatSaleItemsForCsv(items: SaleItem[]) {
  return items
    .map((item) => {
      return `${item.productName} (${item.quantity} x ${formatCsvMoney(
        item.unitPrice
      )})`;
    })
    .join(" | ");
}

function buildSalesCsv(sales: Sale[]) {
  const rows = [
    [
      "Venda",
      "Data",
      "Cliente",
      "Origem",
      "Status",
      "Subtotal",
      "Desconto",
      "Total",
      "Lucro estimado",
      "Itens"
    ],
    ...sales.map((sale) => [
      sale.numberLabel,
      dateTimeFormatter.format(new Date(sale.soldAt)),
      sale.customer?.name ?? "Sem cliente",
      sale.budget?.numberLabel ?? "Venda direta",
      statusLabels[sale.status],
      formatCsvMoney(sale.subtotalAmount),
      formatCsvMoney(sale.discountAmount),
      formatCsvMoney(sale.totalAmount),
      formatCsvMoney(sale.estimatedProfit),
      formatSaleItemsForCsv(sale.items)
    ])
  ];

  return `\uFEFF${rows
    .map((row) => row.map(escapeCsvCell).join(";"))
    .join("\r\n")}`;
}

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function SalesManager({ companyId }: SalesManagerProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<SaleFormState>(() => cloneEmptyForm());
  const [isCancellingId, setIsCancellingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState("");

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

    const [customersResult, productsResult, salesResult] =
      await Promise.allSettled([
        request<Customer[]>("/customers"),
        request<Product[]>("/products"),
        request<Sale[]>("/sales")
      ]);

    if (customersResult.status === "fulfilled") {
      setCustomers(customersResult.value);
    }

    if (productsResult.status === "fulfilled") {
      setProducts(productsResult.value);
    }

    if (salesResult.status === "fulfilled") {
      setSales(salesResult.value);
    }

    const errors = [customersResult, productsResult, salesResult]
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

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return sales;
    }

    return sales.filter((sale) => {
      return [
        sale.numberLabel,
        sale.budget?.numberLabel ?? "",
        sale.customer?.name ?? "",
        sale.items.map((item) => item.productName).join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [sales, search]);

  const completedSales = sales.filter((sale) => sale.status === "completed");
  const totalRevenue = completedSales.reduce(
    (total, sale) => total + sale.totalAmount,
    0
  );
  const totalProfit = completedSales.reduce(
    (total, sale) => total + sale.estimatedProfit,
    0
  );
  const averageTicket = average(completedSales.map((sale) => sale.totalAmount));

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

  function updateField(
    field: keyof Omit<SaleFormState, "items">,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateItem(index: number, field: keyof SaleFormItem, value: string) {
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
          const product = products.find(
            (currentProduct) => currentProduct.id === value
          );
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
    setForm(cloneEmptyForm());
    setMessage(null);
  }

  function buildPayload() {
    const cleanedItems = form.items
      .map((item) => {
        const product = products.find(
          (current) => current.id === item.productId
        );
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
      throw new Error("Adicione pelo menos um produto na venda.");
    }

    const productIds = cleanedItems.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
      throw new Error("Use cada produto apenas uma vez na venda.");
    }

    if (preview.discountAmount > preview.subtotalAmount) {
      throw new Error("O desconto não pode ser maior que o subtotal.");
    }

    return {
      customerId: form.customerId || null,
      discountAmount: preview.discountAmount,
      items: cleanedItems
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = buildPayload();
      const saved = await request<Sale>("/sales", {
        body: JSON.stringify(payload),
        method: "POST"
      });

      setSales((current) =>
        [saved, ...current].sort((a, b) => b.number - a.number)
      );
      resetForm();
      setMessage(
        `Venda ${saved.numberLabel} criada e estoque baixado automaticamente.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelSale(sale: Sale) {
    const shouldCancel = window.confirm(
      `Cancelar ${sale.numberLabel} e devolver os insumos ao estoque?`
    );

    if (!shouldCancel) {
      return;
    }

    setIsCancellingId(sale.id);
    setMessage(null);

    try {
      const updatedSale = await request<Sale>(`/sales/${sale.id}/cancel`, {
        method: "POST"
      });

      setSales((current) =>
        current.map((currentSale) =>
          currentSale.id === updatedSale.id ? updatedSale : currentSale
        )
      );
      setMessage(
        `Venda ${updatedSale.numberLabel} cancelada e estoque estornado.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível cancelar."
      );
    } finally {
      setIsCancellingId(null);
    }
  }

  function exportSalesCsv() {
    if (filteredSales.length === 0) {
      setMessage("Nenhuma venda disponível para exportar.");
      return;
    }

    downloadCsv("carbon-flow-vendas.csv", buildSalesCsv(filteredSales));
    setMessage(`${filteredSales.length} venda(s) exportada(s).`);
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-foreground)]">
            Histórico comercial
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Vendas
          </h1>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-flow-col">
          <Button
            className="w-full sm:w-auto"
            disabled={isLoading || filteredSales.length === 0}
            onClick={exportSalesCsv}
            type="button"
            variant="secondary"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={resetForm}
            type="button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova venda
          </Button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Vendas</p>
            <ShoppingCart
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {completedSales.length}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">
              Faturamento
            </p>
            <CircleDollarSign
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(totalRevenue)}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">
              Lucro estimado
            </p>
            <TrendingUp
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(totalProfit)}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">
              Ticket médio
            </p>
            <ReceiptText
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-white xl:text-2xl">
            {currencyFormatter.format(averageTicket)}
          </p>
        </article>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Venda direta</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Cliente, produtos e baixa automática de estoque
            </p>
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
            onClick={resetForm}
            title="Limpar venda"
            type="button"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 xl:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)] xl:items-start">
            <label className="grid gap-2 text-sm text-white">
              Cliente
              <select
                className="h-11 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
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

            <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted-foreground)]">
                  Produtos
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {preview.itemCount}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted-foreground)]">
                  Subtotal
                </p>
                <p className="mt-1 truncate text-lg font-semibold text-white">
                  {currencyFormatter.format(preview.subtotalAmount)}
                </p>
              </div>
              <label className="grid gap-2 text-sm text-white">
                Desconto
                <input
                  className="h-11 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("discountAmount", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={form.discountAmount}
                />
              </label>
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted-foreground)]">Total</p>
                <p className="mt-1 truncate text-lg font-semibold text-[var(--primary)]">
                  {currencyFormatter.format(preview.totalAmount)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Produtos</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {products.length} disponíveis para venda
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
                Cadastre produtos antes de registrar vendas diretas.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              {form.items.map((item, index) => {
                const quantity = parseDecimal(item.quantity);
                const unitPrice = parseDecimal(item.unitPrice);
                const lineTotal = roundMoney(quantity * unitPrice);

                return (
                  <div
                    className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.68)] p-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.4fr)_minmax(7rem,0.55fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_2.5rem] xl:items-end"
                    key={`${index}-${item.productId}`}
                  >
                    <label className="grid min-w-0 gap-2 text-xs text-white md:col-span-2 xl:col-span-1">
                      Produto
                      <select
                        className="h-10 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
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
                        className="h-10 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
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
                        className="h-10 w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
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

          {message ? (
            <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">
              {message}
            </p>
          ) : null}

          <Button
            className="w-full sm:w-auto sm:justify-self-start"
            disabled={isSaving || products.length === 0}
            type="submit"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Salvar venda e baixar estoque
          </Button>
        </form>
      </section>

      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Lista de vendas
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {filteredSales.length} registros
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
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                <th className="py-3 pr-4 font-medium">Venda</th>
                <th className="py-3 pr-4 font-medium">Cliente</th>
                <th className="py-3 pr-4 font-medium">Origem</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Total</th>
                <th className="py-3 pr-4 font-medium">Lucro</th>
                <th className="py-3 pr-4 font-medium">Itens</th>
                <th className="py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {isLoading ? (
                <TableStateRow
                  colSpan={8}
                  isLoading
                  title="Carregando vendas"
                />
              ) : null}

              {!isLoading && filteredSales.length === 0 ? (
                <TableStateRow
                  colSpan={8}
                  description="Registre uma venda direta ou converta um orçamento aprovado para movimentar o estoque."
                  title="Nenhuma venda encontrada"
                />
              ) : null}

              {!isLoading
                ? filteredSales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-white">
                          {sale.numberLabel}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {dateTimeFormatter.format(new Date(sale.soldAt))}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                        {sale.customer?.name ?? "Sem cliente"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                        {sale.budget?.numberLabel ?? "Venda direta"}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs",
                            getStatusClass(sale.status)
                          ].join(" ")}
                        >
                          {statusLabels[sale.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white">
                        {currencyFormatter.format(sale.totalAmount)}
                      </td>
                      <td className="py-3 pr-4 text-[var(--primary)]">
                        {currencyFormatter.format(sale.estimatedProfit)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex max-w-md flex-wrap gap-2">
                          {sale.items.slice(0, 3).map((item) => (
                            <span
                              className="rounded-md bg-[rgb(159_243_196/0.1)] px-2 py-1 text-xs text-[var(--primary)]"
                              key={item.id}
                            >
                              {item.productName}: {item.quantity}
                            </span>
                          ))}
                          {sale.items.length > 3 ? (
                            <span className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                              +{sale.items.length - 3}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end">
                          {sale.status === "completed" ? (
                            <button
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[rgb(255_107_107/0.12)] hover:text-[#ff8d8d]"
                              disabled={isCancellingId === sale.id}
                              onClick={() => void cancelSale(sale)}
                              title="Cancelar e estornar estoque"
                              type="button"
                            >
                              {isCancellingId === sale.id ? (
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
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              -
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
