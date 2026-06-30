"use client";

import { ArrowLeft, Loader2, Printer, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CarbonDocumentSignature,
  DocumentMetaStrip,
  DocumentPrimaryLogo,
  DocumentTermsList,
  DocumentWatermark
} from "@/features/documents/document-branding";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProductTechnicalSheetProps = {
  companyId: string;
  companyName: string;
  productId: string;
};

type CompanyDetails = {
  address: string | null;
  budgetValidityDays: number;
  commercialTerms: string | null;
  defaultMarginPercent: number;
  document: string | null;
  documentFooter: string | null;
  email: string | null;
  instagram: string | null;
  logoUrl: string | null;
  name: string;
  paymentInstructions: string | null;
  phone: string | null;
  website: string | null;
};

type ProductItem = {
  conversionFactorToInventory: number;
  id: string;
  ingredientId: string;
  ingredientMinimumStock: number;
  ingredientName: string;
  ingredientStockQuantity: number;
  ingredientUnit: string;
  ingredientUnitCost: number;
  inventoryQuantity: number;
  isIngredientLowStock: boolean;
  lineCost: number;
  quantity: number;
  unit: string;
};

type Product = {
  createdAt: string;
  description: string | null;
  estimatedCost: number;
  id: string;
  isActive: boolean;
  items: ProductItem[];
  marginPercent: number;
  name: string;
  salePrice: number;
  sku: string | null;
  suggestedPrice: number;
  updatedAt: string;
};

type ContactLine = {
  label: string;
  value: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
  style: "percent"
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
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

function isCompanyDetails(value: unknown): value is CompanyDetails {
  return (
    value !== null &&
    typeof value === "object" &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function normalizeCompanyDetails(payload: unknown) {
  if (isCompanyDetails(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && "company" in payload) {
    const company = (payload as { company?: unknown }).company;

    return isCompanyDetails(company) ? company : null;
  }

  return null;
}

async function fetchCompanyDetails(headers: HeadersInit) {
  try {
    const response = await fetch(`${env.apiUrl}/companies/document-profile`, {
      headers
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    return normalizeCompanyDetails(payload);
  } catch {
    return null;
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return dateTimeFormatter.format(date);
}

function formatQuantity(value: number, unit: string) {
  return `${decimalFormatter.format(value)} ${unit}`.trim();
}

function getCompanyContactLines(company: CompanyDetails | null) {
  const lines: ContactLine[] = [];

  if (company?.document) {
    lines.push({ label: "Documento", value: company.document });
  }

  if (company?.phone) {
    lines.push({ label: "Telefone", value: company.phone });
  }

  if (company?.email) {
    lines.push({ label: "Email", value: company.email });
  }

  if (company?.address) {
    lines.push({ label: "Endereço", value: company.address });
  }

  if (company?.website) {
    lines.push({ label: "Site", value: company.website });
  }

  if (company?.instagram) {
    lines.push({ label: "Instagram", value: company.instagram });
  }

  return lines;
}

function getItemCapacity(item: ProductItem) {
  if (item.inventoryQuantity <= 0) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(item.ingredientStockQuantity / item.inventoryQuantity)
  );
}

function getStockStatus(item: ProductItem) {
  if (item.ingredientStockQuantity < item.inventoryQuantity) {
    return "Sem estoque para 1 un.";
  }

  if (item.isIngredientLowStock) {
    return "Abaixo do mínimo";
  }

  return "OK";
}

export function ProductTechnicalSheet({
  companyId,
  companyName,
  productId
}: ProductTechnicalSheetProps) {
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);

  const loadProduct = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Sessão expirada. Entre novamente.");
      }

      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId
      };

      const response = await fetch(`${env.apiUrl}/products/${productId}`, {
        headers
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar a ficha técnica.")
        );
      }

      setProduct(payload as Product);
      setCompanyDetails(await fetchCompanyDetails(headers));
    } catch (currentError) {
      setCompanyDetails(null);
      setProduct(null);
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Não foi possível carregar a ficha técnica."
      );
    } finally {
      setIsLoading(false);
    }
  }, [companyId, productId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const capacitySummary = useMemo(() => {
    if (!product || product.items.length === 0) {
      return {
        limitingItems: [] as ProductItem[],
        possibleUnits: null as number | null
      };
    }

    const itemsWithCapacity = product.items
      .map((item) => ({
        item,
        possibleUnits: getItemCapacity(item)
      }))
      .filter(
        (item): item is { item: ProductItem; possibleUnits: number } =>
          item.possibleUnits !== null
      );

    if (itemsWithCapacity.length === 0) {
      return {
        limitingItems: [] as ProductItem[],
        possibleUnits: null as number | null
      };
    }

    const possibleUnits = Math.min(
      ...itemsWithCapacity.map((item) => item.possibleUnits)
    );

    return {
      limitingItems: itemsWithCapacity
        .filter((item) => item.possibleUnits === possibleUnits)
        .map((item) => item.item),
      possibleUnits
    };
  }, [product]);

  const displayCompanyName = companyDetails?.name ?? companyName;
  const companyContactLines = getCompanyContactLines(companyDetails);
  const profit = product ? product.salePrice - product.estimatedCost : 0;
  const saleMargin =
    product && product.salePrice > 0 ? profit / product.salePrice : 0;
  const markup =
    product && product.estimatedCost > 0 ? profit / product.estimatedCost : 0;
  const productTerms = [
    "Ficha técnica de uso interno para orientar produção, compra de insumos e conferência de custos.",
    "Os custos são calculados com base nos insumos e fatores de conversão cadastrados no produto.",
    "A produção possível é uma estimativa pelo estoque atual e pode variar conforme perdas ou ajustes manuais.",
    "Revise composição, unidades e preços antes de usar esta ficha para produção em escala."
  ];
  const productMetaItems = product
    ? [
        { label: "Documento", value: "Ficha técnica" },
        { label: "Produto", value: product.name },
        { label: "SKU", value: product.sku ?? "Sem SKU" },
        { label: "Atualizada em", value: formatDateTime(product.updatedAt) }
      ]
    : [];
  const footerText =
    companyDetails?.documentFooter?.trim() ||
    "Documento gerado pelo Carbon Flow com base na composição e no estoque atual do produto.";

  useEffect(() => {
    if (!product) {
      return;
    }

    const previousTitle = document.title;
    document.title = `Ficha técnica ${product.name} - ${displayCompanyName}`;

    return () => {
      document.title = previousTitle;
    };
  }, [displayCompanyName, product]);

  return (
    <main className="product-sheet-page min-h-screen bg-[#080a0b] px-4 py-4 sm:px-6 lg:py-8">
      <div className="product-sheet-toolbar mx-auto mb-4 flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href="/products">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void loadProduct()}
            type="button"
            variant="secondary"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Atualizar
          </Button>
          <Button
            disabled={!product}
            onClick={() => window.print()}
            type="button"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir/PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <section className="mx-auto flex min-h-[420px] max-w-6xl items-center justify-center rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando ficha técnica
          </span>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="mx-auto max-w-6xl rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] p-6 text-[var(--muted-foreground)]">
          {error}
        </section>
      ) : null}

      {!isLoading && product ? (
        <section className="product-sheet relative mx-auto max-w-6xl overflow-hidden rounded-lg bg-white text-[#101314] shadow-2xl shadow-black/30">
          <DocumentWatermark text="Ficha técnica" />
          <header className="product-sheet-cover relative z-10 bg-[rgb(14_17_18)] px-6 py-7 text-[#f7faf8] sm:px-8 lg:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <DocumentPrimaryLogo
                  companyName={displayCompanyName}
                  logoUrl={companyDetails?.logoUrl}
                />

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ff3c4]">
                    Ficha técnica do produto
                  </p>
                  <h1 className="mt-3 break-words text-3xl font-semibold leading-tight text-[#f7faf8] sm:text-4xl">
                    {product.name}
                  </h1>
                  <div className="mt-4 grid gap-1 text-sm leading-6 text-[#c9d4d0] sm:grid-cols-2">
                    {companyContactLines.length > 0 ? (
                      companyContactLines.map((line) => (
                        <span key={`${line.label}-${line.value}`}>
                          <strong className="font-medium text-[#f7faf8]">
                            {line.label}:
                          </strong>{" "}
                          {line.value}
                        </span>
                      ))
                    ) : (
                      <span>{displayCompanyName}</span>
                    )}
                    <span>
                      <strong className="font-medium text-[#f7faf8]">
                        Atualizada:
                      </strong>{" "}
                      {formatDateTime(product.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <aside className="w-full rounded-md border border-[#31403b] bg-[rgb(255_255_255/0.06)] p-5 lg:max-w-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9ca9a5]">
                      Produto
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#f7faf8]">
                      {product.sku ?? "Sem SKU"}
                    </p>
                  </div>
                  <span className="inline-flex rounded-md border border-[#bde8cc] bg-[#e9fff2] px-2 py-1 text-xs font-medium text-[#17633f]">
                    {product.isActive ? "Ativo" : "Arquivado"}
                  </span>
                </div>

                <div className="mt-6 border-t border-[#31403b] pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9ca9a5]">
                    Produção possível
                  </p>
                  <strong className="mt-2 block text-4xl font-semibold leading-tight text-[#9ff3c4]">
                    {capacitySummary.possibleUnits === null
                      ? "-"
                      : decimalFormatter.format(capacitySummary.possibleUnits)}
                  </strong>
                  <p className="mt-2 text-sm text-[#c9d4d0]">
                    unidades pelo estoque atual
                  </p>
                </div>
              </aside>
            </div>
          </header>

          <div className="relative z-10 p-6 sm:p-8 lg:p-10">
            <section className="grid gap-4 border-b border-[#dfe5e3] pb-7 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#17633f]">
                  Custo total
                </p>
                <strong className="mt-3 block text-2xl font-semibold text-[#101314]">
                  {currencyFormatter.format(product.estimatedCost)}
                </strong>
                <p className="mt-3 text-xs leading-5 text-[#53615d]">
                  Soma dos insumos consumidos em uma unidade do produto.
                </p>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                  Preço sugerido
                </p>
                <strong className="mt-3 block text-2xl font-semibold text-[#17633f]">
                  {currencyFormatter.format(product.suggestedPrice)}
                </strong>
                <p className="mt-3 text-xs leading-5 text-[#53615d]">
                  Custo + {decimalFormatter.format(product.marginPercent)}% de
                  margem configurada.
                </p>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                  Preço de venda
                </p>
                <strong className="mt-3 block text-2xl font-semibold text-[#101314]">
                  {currencyFormatter.format(product.salePrice)}
                </strong>
                <p className="mt-3 text-xs leading-5 text-[#53615d]">
                  Lucro estimado: {currencyFormatter.format(profit)} por
                  unidade.
                </p>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                  Margem real
                </p>
                <strong className="mt-3 block text-2xl font-semibold text-[#101314]">
                  {percentFormatter.format(saleMargin)}
                </strong>
                <p className="mt-3 text-xs leading-5 text-[#53615d]">
                  Markup sobre custo: {percentFormatter.format(markup)}.
                </p>
              </article>
            </section>

            <section className="py-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#17633f]">
                    Composição
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-[#101314]">
                    Insumos e consumo por unidade
                  </h2>
                </div>
                <p className="text-sm text-[#53615d]">
                  {product.items.length}{" "}
                  {product.items.length === 1 ? "insumo" : "insumos"}
                </p>
              </div>

              <div className="product-sheet-table mt-5 overflow-x-auto rounded-md border border-[#dfe5e3]">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="bg-[rgb(16_19_20)] text-[#f7faf8]">
                    <tr className="text-xs uppercase tracking-[0.12em]">
                      <th className="px-4 py-3 font-semibold">Insumo</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Receita
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Estoque
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Custo unit.
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Custo no produto
                      </th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {product.items.map((item) => (
                      <tr key={item.id}>
                        <td className="max-w-[18rem] break-words px-4 py-4">
                          <p className="font-medium text-[#101314]">
                            {item.ingredientName}
                          </p>
                          <p className="mt-1 text-xs text-[#6a7672]">
                            Unidade de estoque: {item.ingredientUnit}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right text-[#53615d]">
                          <span className="block font-medium text-[#101314]">
                            {formatQuantity(item.quantity, item.unit)}
                          </span>
                          <span className="mt-1 block text-xs">
                            consome{" "}
                            {formatQuantity(
                              item.inventoryQuantity,
                              item.ingredientUnit
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-[#53615d]">
                          <span className="block font-medium text-[#101314]">
                            {formatQuantity(
                              item.ingredientStockQuantity,
                              item.ingredientUnit
                            )}
                          </span>
                          <span className="mt-1 block text-xs">
                            mínimo{" "}
                            {formatQuantity(
                              item.ingredientMinimumStock,
                              item.ingredientUnit
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-[#53615d]">
                          {currencyFormatter.format(item.ingredientUnitCost)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-[#101314]">
                          {currencyFormatter.format(item.lineCost)}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={[
                              "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                              item.isIngredientLowStock ||
                              item.ingredientStockQuantity <
                                item.inventoryQuantity
                                ? "border-[#ead1d1] bg-[#fff1f1] text-[#9f2b2b]"
                                : "border-[#bde8cc] bg-[#e9fff2] text-[#17633f]"
                            ].join(" ")}
                          >
                            {getStockStatus(item)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-6 border-t border-[#dfe5e3] pt-7 lg:grid-cols-[1fr_24rem]">
              <div className="grid gap-5">
                <article className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                    Orientação de produção
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#53615d]">
                    {product.description ||
                      "Nenhuma observação técnica foi registrada para este produto."}
                  </p>
                </article>

                <DocumentTermsList
                  items={productTerms}
                  title="Uso da ficha técnica"
                />

                <article className="rounded-md border border-[#dfe5e3] p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                    Insumo limitante
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#53615d]">
                    {capacitySummary.limitingItems.length > 0
                      ? capacitySummary.limitingItems
                          .map((item) => item.ingredientName)
                          .join(", ")
                      : "Não há consumo suficiente para calcular a produção possível."}
                  </p>
                </article>
              </div>

              <aside className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                  Resumo operacional
                </h2>
                <div className="mt-5 grid gap-3">
                  <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                    <span>Custo por unidade</span>
                    <strong className="text-right text-[#101314]">
                      {currencyFormatter.format(product.estimatedCost)}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                    <span>Preço praticado</span>
                    <strong className="text-right text-[#101314]">
                      {currencyFormatter.format(product.salePrice)}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                    <span>Lucro estimado</span>
                    <strong className="text-right text-[#101314]">
                      {currencyFormatter.format(profit)}
                    </strong>
                  </div>
                </div>
                <div className="mt-5 border-t border-[#dfe5e3] pt-5">
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                      Produção
                    </span>
                    <strong className="text-right text-3xl font-semibold text-[#17633f]">
                      {capacitySummary.possibleUnits === null
                        ? "-"
                        : decimalFormatter.format(
                            capacitySummary.possibleUnits
                          )}
                    </strong>
                  </div>
                </div>
                <p className="mt-5 rounded-md bg-white p-3 text-xs leading-5 text-[#53615d]">
                  A produção possível é estimada usando o estoque atual dos
                  insumos e o consumo de uma unidade deste produto.
                </p>
              </aside>
            </section>

            <DocumentMetaStrip items={productMetaItems} />

            <footer className="mt-10 flex flex-col gap-3 border-t border-[#dfe5e3] pt-5 text-xs leading-5 text-[#6a7672] sm:flex-row sm:items-center sm:justify-between">
              <span>{footerText}</span>
              <div className="flex flex-wrap items-center gap-3">
                <CarbonDocumentSignature />
                <span className="font-semibold text-[#101314]">
                  {product.sku ?? product.name}
                </span>
              </div>
            </footer>
          </div>
        </section>
      ) : null}
    </main>
  );
}
