"use client";

import {
  Archive,
  Boxes,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search
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

type IngredientFormState = {
  category: string;
  inventoryUnit: string;
  minimumStock: string;
  name: string;
  stockQuantity: string;
  unitCost: string;
};

const emptyForm: IngredientFormState = {
  category: "",
  inventoryUnit: "un",
  minimumStock: "0",
  name: "",
  stockQuantity: "0",
  unitCost: "0"
};

const unitOptions = ["un", "kg", "g", "L", "ml", "m", "cm", "m2"];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

function formatQuantity(value: number, unit: string) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 4
  }).format(value)} ${unit}`;
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

type IngredientsManagerProps = {
  companyId: string;
};

export function IngredientsManager({ companyId }: IngredientsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IngredientFormState>(emptyForm);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const formSectionRef = useRef<HTMLElement | null>(null);

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

  const loadIngredients = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const data = await request<Ingredient[]>("/ingredients");
      setIngredients(data);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadIngredients();
  }, [loadIngredients]);

  const filteredIngredients = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return ingredients;
    }

    return ingredients.filter((ingredient) => {
      return [
        ingredient.name,
        ingredient.category ?? "",
        ingredient.inventoryUnit
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [ingredients, search]);

  const lowStockCount = ingredients.filter(
    (ingredient) => ingredient.stockQuantity <= ingredient.minimumStock
  ).length;

  function updateField(field: keyof IngredientFormState, value: string) {
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

  function scrollToForm() {
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function createIngredient() {
    resetForm();
    scrollToForm();
  }

  useEffect(() => {
    function runAssistantAction() {
      clearStoredAssistantAction("create-ingredient");
      createIngredient();
    }

    if (getStoredAssistantAction() === "create-ingredient") {
      runAssistantAction();
    }

    function handleAssistantAction(event: Event) {
      if (
        event instanceof CustomEvent &&
        event.detail === "create-ingredient"
      ) {
        runAssistantAction();
      }
    }

    window.addEventListener(assistantActionEvent, handleAssistantAction);

    return () => {
      window.removeEventListener(assistantActionEvent, handleAssistantAction);
    };
  }, []);

  function editIngredient(ingredient: Ingredient) {
    setEditingId(ingredient.id);
    setForm({
      category: ingredient.category ?? "",
      inventoryUnit: ingredient.inventoryUnit,
      minimumStock: String(ingredient.minimumStock),
      name: ingredient.name,
      stockQuantity: String(ingredient.stockQuantity),
      unitCost: String(ingredient.unitCost)
    });
    setMessage(null);
    scrollToForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const payload = {
      category: form.category.trim() || undefined,
      inventoryUnit: form.inventoryUnit.trim(),
      minimumStock: Number(form.minimumStock),
      name: form.name.trim(),
      stockQuantity: Number(form.stockQuantity),
      unitCost: Number(form.unitCost)
    };

    try {
      const saved = editingId
        ? await request<Ingredient>(`/ingredients/${editingId}`, {
            body: JSON.stringify(payload),
            method: "PATCH"
          })
        : await request<Ingredient>("/ingredients", {
            body: JSON.stringify(payload),
            method: "POST"
          });

      setIngredients((current) => {
        const next = editingId
          ? current.map((ingredient) =>
              ingredient.id === saved.id ? saved : ingredient
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

  async function archiveIngredient(ingredient: Ingredient) {
    const shouldArchive = window.confirm(`Arquivar ${ingredient.name}?`);

    if (!shouldArchive) {
      return;
    }

    setMessage(null);

    try {
      await request<Ingredient>(`/ingredients/${ingredient.id}`, {
        method: "DELETE"
      });
      setIngredients((current) =>
        current.filter((item) => item.id !== ingredient.id)
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível arquivar."
      );
    }
  }

  return (
    <>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.72)] p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-foreground)]">
            Cadastros operacionais
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Insumos
          </h1>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={createIngredient}
          type="button"
          variant="secondary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo insumo
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Ativos</p>
            <Boxes className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-white">
            {ingredients.length}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <p className="text-sm text-[var(--muted-foreground)]">Estoque baixo</p>
          <p className="mt-4 text-2xl font-semibold text-white">
            {lowStockCount}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <p className="text-sm text-[var(--muted-foreground)]">
            Custo médio
          </p>
          <p className="mt-4 text-2xl font-semibold text-white">
            {ingredients.length
              ? currencyFormatter.format(
                  ingredients.reduce(
                    (total, ingredient) => total + ingredient.unitCost,
                    0
                  ) / ingredients.length
                )
              : currencyFormatter.format(0)}
          </p>
        </article>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <section
          className="min-w-0 scroll-mt-24 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5"
          id="ingredient-form"
          ref={formSectionRef}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                {editingId ? "Editar insumo" : "Novo insumo"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Custos e estoque inicial
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
                placeholder="Farinha de trigo"
                required
                type="text"
                value={form.name}
              />
            </label>

            <label className="grid gap-2 text-sm text-white">
              Categoria
              <input
                className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) =>
                  updateField("category", event.target.value)
                }
                placeholder="Massas, embalagens, ferragens"
                type="text"
                value={form.category}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Unidade
                <select
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  onChange={(event) =>
                    updateField("inventoryUnit", event.target.value)
                  }
                  value={form.inventoryUnit}
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-white">
                Custo unitário
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("unitCost", event.target.value)
                  }
                  step="0.0001"
                  type="number"
                  value={form.unitCost}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white">
                Estoque atual
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("stockQuantity", event.target.value)
                  }
                  step="0.0001"
                  type="number"
                  value={form.stockQuantity}
                />
              </label>

              <label className="grid gap-2 text-sm text-white">
                Estoque mínimo
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition focus:border-[var(--primary)]"
                  min="0"
                  onChange={(event) =>
                    updateField("minimumStock", event.target.value)
                  }
                  step="0.0001"
                  type="number"
                  value={form.minimumStock}
                />
              </label>
            </div>

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
              {editingId ? "Salvar alterações" : "Salvar insumo"}
            </Button>
          </form>
        </section>

        <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Lista de insumos
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {filteredIngredients.length} registros
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
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="py-3 pr-4 font-medium">Nome</th>
                  <th className="py-3 pr-4 font-medium">Categoria</th>
                  <th className="py-3 pr-4 font-medium">Custo</th>
                  <th className="py-3 pr-4 font-medium">Estoque</th>
                  <th className="py-3 pr-4 font-medium">Mínimo</th>
                  <th className="py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <TableStateRow
                    colSpan={6}
                    isLoading
                    title="Carregando insumos"
                  />
                ) : null}

                {!isLoading && filteredIngredients.length === 0 ? (
                  <TableStateRow
                    colSpan={6}
                    description="Cadastre farinha, tecido, peças, embalagens ou qualquer matéria-prima usada na produção."
                    title="Nenhum insumo encontrado"
                  />
                ) : null}

                {!isLoading
                  ? filteredIngredients.map((ingredient) => {
                      const isLowStock =
                        ingredient.stockQuantity <= ingredient.minimumStock;

                      return (
                        <tr key={ingredient.id}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-white">
                              {ingredient.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                              {ingredient.inventoryUnit}
                            </p>
                          </td>
                          <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                            {ingredient.category ?? "-"}
                          </td>
                          <td className="py-3 pr-4 text-white">
                            {currencyFormatter.format(ingredient.unitCost)}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={[
                                "rounded-md px-2 py-1 text-xs",
                                isLowStock
                                  ? "bg-[rgb(255_107_107/0.12)] text-[#ff8d8d]"
                                  : "bg-[rgb(159_243_196/0.12)] text-[var(--primary)]"
                              ].join(" ")}
                            >
                              {formatQuantity(
                                ingredient.stockQuantity,
                                ingredient.inventoryUnit
                              )}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                            {formatQuantity(
                              ingredient.minimumStock,
                              ingredient.inventoryUnit
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                                onClick={() => editIngredient(ingredient)}
                                title="Editar"
                                type="button"
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-white"
                                onClick={() => void archiveIngredient(ingredient)}
                                title="Arquivar"
                                type="button"
                              >
                                <Archive className="h-4 w-4" aria-hidden="true" />
                              </button>
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
