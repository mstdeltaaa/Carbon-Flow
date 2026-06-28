"use client";

import {
  Archive,
  Calculator,
  CircleDollarSign,
  Layers3,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";

import { Button } from "@/components/ui/button";
import { TableStateRow } from "@/components/ui/table-state-row";
import {
  assistantActionEvent,
  clearStoredAssistantAction,
  getStoredAssistantAction
} from "@/features/assistant/assistant-actions";
import { canManageProducts } from "@/lib/access-control";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Ingredient = {
  id: string;
  name: string;
  category: string | null;
  inventoryUnit: string;
  unitCost: number;
  stockQuantity: number;
  minimumStock: number;
  isActive: boolean;
};

type ProductItem = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  ingredientUnitCost: number;
  quantity: number;
  unit: string;
  conversionFactorToInventory: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  estimatedCost: number;
  suggestedPrice: number;
  salePrice: number;
  marginPercent: number;
  isActive: boolean;
  items: ProductItem[];
};

type ProductFormItem = {
  conversionFactorToInventory: string;
  ingredientId: string;
  quantity: string;
  unit: string;
};

type ProductFormState = {
  description: string;
  items: ProductFormItem[];
  marginPercent: string;
  name: string;
  salePrice: string;
  sku: string;
};

type ProductsManagerProps = {
  companyId: string;
  role: string | null;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
  style: "percent"
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4
});

const emptyItem: ProductFormItem = {
  conversionFactorToInventory: "1",
  ingredientId: "",
  quantity: "1",
  unit: ""
};

const emptyForm: ProductFormState = {
  description: "",
  items: [emptyItem],
  marginPercent: "30",
  name: "",
  salePrice: "",
  sku: ""
};

function cloneEmptyItem(): ProductFormItem {
  return { ...emptyItem };
}

function cloneEmptyForm(): ProductFormState {
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

function formatQuantity(value: number, unit: string) {
  return `${decimalFormatter.format(value)} ${unit}`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function ProductsManager({ companyId, role }: ProductsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(() => cloneEmptyForm());
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const formSectionRef = useRef<HTMLElement | null>(null);
  const canManage = canManageProducts(role);

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

    const productsResult = await request<Product[]>("/products")
      .then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason: unknown) => ({ status: "rejected" as const, reason }));
    const ingredientsResult = canManage
      ? await request<Ingredient[]>("/ingredients")
          .then((value) => ({ status: "fulfilled" as const, value }))
          .catch((reason: unknown) => ({ status: "rejected" as const, reason }))
      : null;

    if (ingredientsResult?.status === "fulfilled") {
      setIngredients(ingredientsResult.value);
    }

    if (productsResult.status === "fulfilled") {
      setProducts(productsResult.value);
    }

    const errors = [ingredientsResult, productsResult]
      .filter((result): result is NonNullable<typeof result> =>
        Boolean(result)
      )
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
  }, [canManage, request]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return products;
    }

    return products.filter((product) => {
      return [
        product.name,
        product.sku ?? "",
        product.items.map((item) => item.ingredientName).join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [products, search]);

  const preview = useMemo(() => {
    const calculatedItems = form.items
      .map((item) => {
        const ingredient = ingredients.find(
          (current) => current.id === item.ingredientId
        );
        const quantity = parseDecimal(item.quantity);
        const factor = parseDecimal(item.conversionFactorToInventory, 1);

        if (!ingredient || quantity <= 0 || factor <= 0) {
          return null;
        }

        return {
          cost: quantity * factor * ingredient.unitCost,
          factor,
          ingredient,
          quantity,
          unit: item.unit.trim() || ingredient.inventoryUnit
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const estimatedCost = roundMoney(
      calculatedItems.reduce((total, item) => total + item.cost, 0)
    );
    const marginPercent = parseDecimal(form.marginPercent, 30);
    const suggestedPrice = roundMoney(estimatedCost * (1 + marginPercent / 100));
    const salePrice = form.salePrice.trim()
      ? parseDecimal(form.salePrice)
      : suggestedPrice;
    const profit = roundMoney(salePrice - estimatedCost);

    return {
      estimatedCost,
      itemCount: calculatedItems.length,
      marginPercent,
      profit,
      salePrice,
      suggestedPrice
    };
  }, [form, ingredients]);

  const averageCost = average(products.map((product) => product.estimatedCost));
  const averageSalePrice = average(products.map((product) => product.salePrice));
  const averageMarkup = average(
    products.map((product) =>
      product.estimatedCost > 0
        ? (product.salePrice - product.estimatedCost) / product.estimatedCost
        : 0
    )
  );
  const ingredientPreviewNames = ingredients
    .slice(0, 4)
    .map((ingredient) => ingredient.name);

  function updateField(field: keyof ProductFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateItem(
    index: number,
    field: keyof ProductFormItem,
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

        if (field === "ingredientId") {
          const ingredient = ingredients.find(
            (currentIngredient) => currentIngredient.id === value
          );
          nextItem.unit = ingredient?.inventoryUnit ?? "";
          nextItem.conversionFactorToInventory =
            nextItem.conversionFactorToInventory || "1";
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

  function scrollToForm() {
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function createProduct() {
    resetForm();
    scrollToForm();
  }

  useEffect(() => {
    function runAssistantAction() {
      clearStoredAssistantAction("create-product");
      createProduct();
    }

    if (getStoredAssistantAction() === "create-product") {
      runAssistantAction();
    }

    function handleAssistantAction(event: Event) {
      if (event instanceof CustomEvent && event.detail === "create-product") {
        runAssistantAction();
      }
    }

    window.addEventListener(assistantActionEvent, handleAssistantAction);

    return () => {
      window.removeEventListener(assistantActionEvent, handleAssistantAction);
    };
  }, []);

  function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      description: product.description ?? "",
      items: product.items.length
        ? product.items.map((item) => ({
            conversionFactorToInventory: String(
              item.conversionFactorToInventory
            ),
            ingredientId: item.ingredientId,
            quantity: String(item.quantity),
            unit: item.unit
          }))
        : [cloneEmptyItem()],
      marginPercent: String(product.marginPercent),
      name: product.name,
      salePrice: String(product.salePrice),
      sku: product.sku ?? ""
    });
    setMessage(null);
    scrollToForm();
  }

  function buildPayload() {
    const cleanedItems = form.items
      .map((item) => {
        const ingredient = ingredients.find(
          (current) => current.id === item.ingredientId
        );
        const quantity = parseDecimal(item.quantity);
        const conversionFactorToInventory = parseDecimal(
          item.conversionFactorToInventory,
          1
        );

        if (!ingredient || quantity <= 0 || conversionFactorToInventory <= 0) {
          return null;
        }

        return {
          conversionFactorToInventory,
          ingredientId: ingredient.id,
          quantity,
          unit: item.unit.trim() || ingredient.inventoryUnit
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (cleanedItems.length === 0) {
      throw new Error("Adicione pelo menos um insumo na composição.");
    }

    const ingredientIds = cleanedItems.map((item) => item.ingredientId);
    const hasDuplicatedIngredient = new Set(ingredientIds).size !== ingredientIds.length;

    if (hasDuplicatedIngredient) {
      throw new Error("Use cada insumo apenas uma vez na composição.");
    }

    return {
      description: form.description.trim() || undefined,
      items: cleanedItems,
      marginPercent: parseDecimal(form.marginPercent, 30),
      name: form.name.trim(),
      salePrice: form.salePrice.trim()
        ? parseDecimal(form.salePrice)
        : undefined,
      sku: form.sku.trim() || undefined
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = buildPayload();
      const saved = editingId
        ? await request<Product>(`/products/${editingId}`, {
            body: JSON.stringify(payload),
            method: "PATCH"
          })
        : await request<Product>("/products", {
            body: JSON.stringify(payload),
            method: "POST"
          });

      setProducts((current) => {
        const next = editingId
          ? current.map((product) =>
              product.id === saved.id ? saved : product
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

  async function archiveProduct(product: Product) {
    const shouldArchive = window.confirm(`Arquivar ${product.name}?`);

    if (!shouldArchive) {
      return;
    }

    setMessage(null);

    try {
      await request<Product>(`/products/${product.id}`, {
        method: "DELETE"
      });
      setProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível arquivar."
      );
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Producao e precificacao
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Produtos
          </h1>
        </div>
        {canManage ? (
          <Button onClick={createProduct} type="button" variant="secondary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo produto
          </Button>
        ) : null}
      </header>

      <section
        className={
          canManage
            ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            : "grid gap-4 md:grid-cols-2"
        }
      >
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Ativos</p>
            <PackageCheck
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {products.length}
          </p>
        </article>
        {canManage ? (
          <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--muted-foreground)]">
                Custo médio
              </p>
              <Calculator
                className="h-4 w-4 text-[var(--primary)]"
                aria-hidden="true"
              />
            </div>
            <p className="mt-4 text-2xl font-semibold text-white">
              {currencyFormatter.format(averageCost)}
            </p>
          </article>
        ) : null}
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Preço médio</p>
            <CircleDollarSign
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {currencyFormatter.format(averageSalePrice)}
          </p>
        </article>
        {canManage ? (
          <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--muted-foreground)]">
                Margem média
              </p>
              <Layers3
                className="h-4 w-4 text-[var(--primary)]"
                aria-hidden="true"
              />
            </div>
            <p className="mt-4 text-2xl font-semibold text-white">
              {percentFormatter.format(averageMarkup)}
            </p>
          </article>
        ) : null}
      </section>

      <div
        className={
          canManage ? "grid gap-4 2xl:grid-cols-[0.92fr_1.08fr]" : "grid gap-4"
        }
      >
        {canManage ? (
        <section
          className="min-w-0 scroll-mt-24 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
          id="product-form"
          ref={formSectionRef}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                {editingId ? "Editar produto" : "Novo produto"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Composição, custo e preço
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
                placeholder="Bolo de chocolate"
                required
                type="text"
                value={form.name}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                SKU
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  onChange={(event) => updateField("sku", event.target.value)}
                  placeholder="BOLO-CHOC-P"
                  type="text"
                  value={form.sku}
                />
              </label>

              <label className="grid gap-2 text-sm text-white">
                Margem %
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("marginPercent", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={form.marginPercent}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-white">
              Descrição
              <textarea
                className="min-h-24 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 py-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Detalhes internos de produção"
                value={form.description}
              />
            </label>

            <div className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Composição
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {ingredients.length} disponíveis / {preview.itemCount} na
                    receita
                  </p>
                </div>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                  onClick={addItem}
                  title="Adicionar insumo"
                  type="button"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {ingredients.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {ingredientPreviewNames.map((name) => (
                    <span
                      className="rounded-md bg-[rgb(159_243_196/0.1)] px-2 py-1 text-xs text-[var(--primary)]"
                      key={name}
                    >
                      {name}
                    </span>
                  ))}
                  {ingredients.length > ingredientPreviewNames.length ? (
                    <span className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                      +{ingredients.length - ingredientPreviewNames.length}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.68)] p-3 text-sm text-[var(--muted-foreground)]">
                  Nenhum insumo ativo encontrado para montar produtos.
                </p>
              )}

              <div className="mt-4 grid gap-3">
                {form.items.map((item, index) => {
                  const selectedIngredient = ingredients.find(
                    (ingredient) => ingredient.id === item.ingredientId
                  );

                  return (
                    <div
                      className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.68)] p-3 sm:grid-cols-2 2xl:grid-cols-[1.3fr_0.7fr_0.56fr_0.7fr_2.5rem] 2xl:items-end"
                      key={`${index}-${item.ingredientId}`}
                    >
                      <label className="grid min-w-0 gap-2 text-xs text-white sm:col-span-2 2xl:col-span-1">
                        Insumo
                        <select
                          className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                          onChange={(event) =>
                            updateItem(index, "ingredientId", event.target.value)
                          }
                          required
                          value={item.ingredientId}
                        >
                          <option className="bg-[#101314] text-white" value="">
                            Selecione
                          </option>
                          {ingredients.map((ingredient) => (
                            <option
                              className="bg-[#101314] text-white"
                              key={ingredient.id}
                              value={ingredient.id}
                            >
                              {ingredient.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-xs text-white">
                        Quantidade
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
                        Unidade
                        <input
                          className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                          onChange={(event) =>
                            updateItem(index, "unit", event.target.value)
                          }
                          placeholder={selectedIngredient?.inventoryUnit ?? "un"}
                          type="text"
                          value={item.unit}
                        />
                      </label>

                      <label className="grid gap-2 text-xs text-white">
                        Fator
                        <input
                          className="h-10 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-sm text-white outline-none transition focus:border-[var(--primary)]"
                          min="0.00000001"
                          onChange={(event) =>
                            updateItem(
                              index,
                              "conversionFactorToInventory",
                              event.target.value
                            )
                          }
                          required
                          step="0.00000001"
                          type="number"
                          value={item.conversionFactorToInventory}
                        />
                      </label>

                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white sm:self-end"
                        onClick={() => removeItem(index)}
                        title="Remover insumo"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Custo calculado
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {currencyFormatter.format(preview.estimatedCost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Preço sugerido
                </p>
                <p className="mt-1 text-lg font-semibold text-[var(--primary)]">
                  {currencyFormatter.format(preview.suggestedPrice)}
                </p>
              </div>
              <label className="grid gap-2 text-sm text-white">
                Preço manual
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("salePrice", event.target.value)
                  }
                  placeholder={String(preview.suggestedPrice)}
                  step="0.01"
                  type="number"
                  value={form.salePrice}
                />
              </label>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Lucro previsto
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {currencyFormatter.format(preview.profit)}
                </p>
              </div>
            </div>

            {message ? (
              <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
                {message}
              </p>
            ) : null}

            <Button disabled={isSaving || ingredients.length === 0} type="submit">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {editingId ? "Salvar alterações" : "Salvar produto"}
            </Button>
          </form>
        </section>
        ) : null}

        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Lista de produtos
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {filteredProducts.length} registros
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

          {!canManage && message ? (
            <p className="mt-5 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
              {message}
            </p>
          ) : null}

          <div className="mt-5 overflow-x-auto">
            <table
              className={[
                "w-full border-collapse text-left text-sm",
                canManage ? "min-w-[900px]" : "min-w-[520px]"
              ].join(" ")}
            >
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="py-3 pr-4 font-medium">Produto</th>
                  {canManage ? (
                    <>
                      <th className="py-3 pr-4 font-medium">Custo</th>
                      <th className="py-3 pr-4 font-medium">Sugerido</th>
                    </>
                  ) : null}
                  <th className="py-3 pr-4 font-medium">Venda</th>
                  {canManage ? (
                    <th className="py-3 pr-4 font-medium">Composição</th>
                  ) : null}
                  {canManage ? (
                    <th className="py-3 text-right font-medium">Ações</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <TableStateRow
                    colSpan={canManage ? 6 : 2}
                    isLoading
                    title="Carregando produtos"
                  />
                ) : null}

                {!isLoading && filteredProducts.length === 0 ? (
                  <TableStateRow
                    colSpan={canManage ? 6 : 2}
                    description="Monte produtos com composição, custo calculado e preço de venda sugerido."
                    title="Nenhum produto encontrado"
                  />
                ) : null}

                {!isLoading
                  ? filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-white">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {product.sku ?? "Sem SKU"}
                          </p>
                        </td>
                        {canManage ? (
                          <>
                            <td className="py-3 pr-4 text-white">
                              {currencyFormatter.format(product.estimatedCost)}
                            </td>
                            <td className="py-3 pr-4 text-[var(--primary)]">
                              {currencyFormatter.format(product.suggestedPrice)}
                            </td>
                          </>
                        ) : null}
                        <td className="py-3 pr-4 text-white">
                          {currencyFormatter.format(product.salePrice)}
                        </td>
                        {canManage ? (
                          <td className="py-3 pr-4">
                            <div className="flex max-w-sm flex-wrap gap-2">
                              {product.items.slice(0, 3).map((item) => (
                                <span
                                  className="rounded-md bg-[rgb(159_243_196/0.1)] px-2 py-1 text-xs text-[var(--primary)]"
                                  key={item.id}
                                >
                                  {item.ingredientName}:{" "}
                                  {formatQuantity(item.quantity, item.unit)}
                                </span>
                              ))}
                              {product.items.length > 3 ? (
                                <span className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                                  +{product.items.length - 3}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                        {canManage ? (
                          <td className="py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                                onClick={() => editProduct(product)}
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
                                onClick={() => void archiveProduct(product)}
                                title="Arquivar"
                                type="button"
                              >
                                <Archive
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </td>
                        ) : null}
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
