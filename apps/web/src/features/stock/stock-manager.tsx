"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  History,
  Loader2,
  PackagePlus,
  Save,
  Search,
  SlidersHorizontal,
  Warehouse
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TableStateRow } from "@/components/ui/table-state-row";
import {
  assistantActionEvent,
  clearStoredAssistantAction,
  getStoredAssistantAction,
  type AssistantActionId
} from "@/features/assistant/assistant-actions";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type StockItem = {
  id: string;
  name: string;
  category: string | null;
  inventoryUnit: string;
  unitCost: number;
  stockQuantity: number;
  minimumStock: number;
  stockValue: number;
  isLowStock: boolean;
};

type StockMovement = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  type: "entry" | "sale" | "adjustment" | "reversal";
  quantityDelta: number;
  unitCost: number | null;
  sourceType: string | null;
  sourceId: string | null;
  notes: string | null;
  createdAt: string;
};

type StockFormState = {
  ingredientId: string;
  notes: string;
  quantity: string;
  type: "entry" | "adjustment";
  unitCost: string;
};

type MovementResponse = {
  item: StockItem;
  movement: StockMovement;
};

type StockManagerProps = {
  companyId: string;
};

const emptyForm: StockFormState = {
  ingredientId: "",
  notes: "",
  quantity: "0",
  type: "entry",
  unitCost: ""
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const movementLabels: Record<StockMovement["type"], string> = {
  adjustment: "Ajuste",
  entry: "Entrada",
  reversal: "Estorno",
  sale: "Venda"
};

function parseDecimal(value: string, fallback = 0) {
  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) ? parsed : fallback;
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

function formatQuantity(value: number, unit: string) {
  return `${decimalFormatter.format(value)} ${unit}`;
}

function formatDelta(value: number, unit: string) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${decimalFormatter.format(value)} ${unit}`;
}

function getMovementClass(type: StockMovement["type"], delta: number) {
  if (type === "sale" || delta < 0) {
    return "bg-[rgb(255_107_107/0.12)] text-[#ff8d8d]";
  }

  if (type === "entry" || delta > 0) {
    return "bg-[rgb(159_243_196/0.12)] text-[var(--primary)]";
  }

  return "bg-[var(--secondary)] text-[var(--muted-foreground)]";
}

export function StockManager({ companyId }: StockManagerProps) {
  const [form, setForm] = useState<StockFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
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

    try {
      const [stockItems, stockMovements] = await Promise.all([
        request<StockItem[]>("/stock"),
        request<StockMovement[]>("/stock/movements")
      ]);

      setItems(stockItems);
      setMovements(stockMovements);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function runAssistantAction(actionId: AssistantActionId) {
      const targetId =
        actionId === "open-stock-movement"
          ? "stock-movement-form"
          : "stock-list";

      clearStoredAssistantAction(actionId);
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    }

    const storedAction = getStoredAssistantAction();

    if (
      storedAction === "open-stock-list" ||
      storedAction === "open-stock-movement"
    ) {
      runAssistantAction(storedAction);
    }

    function handleAssistantAction(event: Event) {
      if (
        event instanceof CustomEvent &&
        (event.detail === "open-stock-list" ||
          event.detail === "open-stock-movement")
      ) {
        runAssistantAction(event.detail);
      }
    }

    window.addEventListener(assistantActionEvent, handleAssistantAction);

    return () => {
      window.removeEventListener(assistantActionEvent, handleAssistantAction);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return items;
    }

    return items.filter((item) =>
      [item.name, item.category ?? "", item.inventoryUnit]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [items, search]);

  const selectedItem = items.find((item) => item.id === form.ingredientId);
  const lowStockCount = items.filter((item) => item.isLowStock).length;
  const totalStockValue = items.reduce((total, item) => total + item.stockValue, 0);
  const totalUnits = items.reduce((total, item) => total + item.stockQuantity, 0);

  function updateField(field: keyof StockFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function resetForm() {
    setForm(emptyForm);
  }

  function buildPayload() {
    if (!form.ingredientId) {
      throw new Error("Selecione um insumo.");
    }

    const quantity = parseDecimal(form.quantity);

    if (form.type === "entry" && quantity <= 0) {
      throw new Error("Informe uma quantidade de entrada maior que zero.");
    }

    if (form.type === "adjustment" && quantity < 0) {
      throw new Error("O saldo ajustado não pode ser negativo.");
    }

    const unitCost = form.unitCost.trim()
      ? parseDecimal(form.unitCost)
      : undefined;

    return {
      ingredientId: form.ingredientId,
      notes: form.notes.trim() || undefined,
      quantity,
      type: form.type,
      unitCost
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const saved = await request<MovementResponse>("/stock/movements", {
        body: JSON.stringify(buildPayload()),
        method: "POST"
      });

      setItems((current) =>
        current.map((item) => (item.id === saved.item.id ? saved.item : item))
      );
      setMovements((current) => [saved.movement, ...current].slice(0, 100));
      setMessage("Estoque atualizado.");
      resetForm();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Saldos e movimentacoes
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Estoque
          </h1>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Insumos</p>
            <Warehouse
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {items.length}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Estoque baixo</p>
            <AlertTriangle
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {lowStockCount}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Valor estimado</p>
            <PackagePlus
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {currencyFormatter.format(totalStockValue)}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Movimentos</p>
            <History
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {movements.length}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            {decimalFormatter.format(totalUnits)} unidades somadas
          </p>
        </article>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[0.82fr_1.18fr]">
        <section
          className="min-w-0 scroll-mt-24 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
          id="stock-movement-form"
        >
          <div>
            <h2 className="text-base font-semibold text-white">
              Lançar movimentação
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Entrada ou ajuste manual
            </p>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm text-white">
              Insumo
              <select
                className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                onChange={(event) => updateField("ingredientId", event.target.value)}
                required
                value={form.ingredientId}
              >
                <option className="bg-[#101314] text-white" value="">
                  Selecione
                </option>
                {items.map((item) => (
                  <option
                    className="bg-[#101314] text-white"
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedItem ? (
              <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-3 text-sm text-[var(--muted-foreground)]">
                Saldo atual:{" "}
                <span className="font-medium text-white">
                  {formatQuantity(
                    selectedItem.stockQuantity,
                    selectedItem.inventoryUnit
                  )}
                </span>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Tipo
                <select
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("type", event.target.value as StockFormState["type"])
                  }
                  value={form.type}
                >
                  <option className="bg-[#101314] text-white" value="entry">
                    Entrada
                  </option>
                  <option className="bg-[#101314] text-white" value="adjustment">
                    Ajuste de saldo
                  </option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-white">
                {form.type === "entry" ? "Quantidade" : "Novo saldo"}
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min={form.type === "entry" ? "0.0001" : "0"}
                  onChange={(event) => updateField("quantity", event.target.value)}
                  required
                  step="0.0001"
                  type="number"
                  value={form.quantity}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-white">
              Custo unitário da entrada
              <input
                className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                min="0"
                onChange={(event) => updateField("unitCost", event.target.value)}
                placeholder={
                  selectedItem ? String(selectedItem.unitCost) : "Opcional"
                }
                step="0.0001"
                type="number"
                value={form.unitCost}
              />
            </label>

            <label className="grid gap-2 text-sm text-white">
              Observações
              <textarea
                className="min-h-24 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 py-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Compra, contagem física, correção de saldo"
                value={form.notes}
              />
            </label>

            {message ? (
              <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
                {message}
              </p>
            ) : null}

            <Button disabled={isSaving || items.length === 0} type="submit">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Salvar movimentação
            </Button>
          </form>
        </section>

        <section
          className="min-w-0 scroll-mt-24 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
          id="stock-list"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Saldos</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {filteredItems.length} registros
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
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="py-3 pr-4 font-medium">Insumo</th>
                  <th className="py-3 pr-4 font-medium">Saldo</th>
                  <th className="py-3 pr-4 font-medium">Mínimo</th>
                  <th className="py-3 pr-4 font-medium">Custo</th>
                  <th className="py-3 pr-4 font-medium">Valor</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <TableStateRow
                    colSpan={6}
                    isLoading
                    title="Carregando saldos"
                  />
                ) : null}

                {!isLoading && filteredItems.length === 0 ? (
                  <TableStateRow
                    colSpan={6}
                    description="Cadastre insumos para acompanhar saldos, custos e alertas de reposição."
                    title="Nenhum saldo encontrado"
                  />
                ) : null}

                {!isLoading
                  ? filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {item.category ?? "Sem categoria"}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {formatQuantity(item.stockQuantity, item.inventoryUnit)}
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                          {formatQuantity(item.minimumStock, item.inventoryUnit)}
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {currencyFormatter.format(item.unitCost)}
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {currencyFormatter.format(item.stockValue)}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={[
                              "rounded-md px-2 py-1 text-xs",
                              item.isLowStock
                                ? "bg-[rgb(255_107_107/0.12)] text-[#ff8d8d]"
                                : "bg-[rgb(159_243_196/0.12)] text-[var(--primary)]"
                            ].join(" ")}
                          >
                            {item.isLowStock ? "Repor" : "Ok"}
                          </span>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Histórico</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Últimas 100 movimentações
            </p>
          </div>
          <SlidersHorizontal
            className="h-5 w-5 text-[var(--primary)]"
            aria-hidden="true"
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                <th className="py-3 pr-4 font-medium">Data</th>
                <th className="py-3 pr-4 font-medium">Insumo</th>
                <th className="py-3 pr-4 font-medium">Tipo</th>
                <th className="py-3 pr-4 font-medium">Quantidade</th>
                <th className="py-3 pr-4 font-medium">Origem</th>
                <th className="py-3 pr-4 font-medium">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {movements.length === 0 ? (
                <TableStateRow
                  colSpan={6}
                  description="Entradas, ajustes e baixas automáticas de vendas aparecerão neste histórico."
                  title="Nenhuma movimentação registrada"
                />
              ) : null}

              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                    {dateTimeFormatter.format(new Date(movement.createdAt))}
                  </td>
                  <td className="py-3 pr-4 text-white">
                    {movement.ingredientName}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                        getMovementClass(movement.type, movement.quantityDelta)
                      ].join(" ")}
                    >
                      {movement.quantityDelta < 0 ? (
                        <ArrowDownRight
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowUpRight
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      )}
                      {movementLabels[movement.type]}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-white">
                    {formatDelta(movement.quantityDelta, movement.ingredientUnit)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                    {movement.sourceType === "sale"
                      ? "Venda"
                      : movement.sourceType === "manual"
                        ? "Manual"
                        : "-"}
                  </td>
                  <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                    {movement.notes ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
