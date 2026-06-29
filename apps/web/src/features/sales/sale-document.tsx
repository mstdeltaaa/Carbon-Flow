"use client";

import { ArrowLeft, Loader2, Printer, RefreshCcw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SaleStatus = "completed" | "cancelled" | "refunded";

type SaleCustomer = {
  address: string | null;
  email: string | null;
  id: string;
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

type Sale = {
  budget: {
    id: string;
    number: number;
    numberLabel: string;
    status: string;
  } | null;
  budgetId: string | null;
  customer: SaleCustomer | null;
  customerId: string | null;
  discountAmount: number;
  estimatedProfit: number;
  id: string;
  items: SaleItem[];
  numberLabel: string;
  soldAt: string;
  status: SaleStatus;
  subtotalAmount: number;
  totalAmount: number;
};

type SaleDocumentProps = {
  companyId: string;
  companyName: string;
  saleId: string;
};

type CompanyDetails = {
  document: string | null;
  email: string | null;
  name: string;
  phone: string | null;
};

type ContactLine = {
  label: string;
  value: string;
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

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0
});

const statusLabels: Record<SaleStatus, string> = {
  cancelled: "Cancelada",
  completed: "Concluída",
  refunded: "Estornada"
};

const statusClasses: Record<SaleStatus, string> = {
  cancelled: "border-[#ead1d1] bg-[#fff1f1] text-[#9f2b2b]",
  completed: "border-[#bde8cc] bg-[#e9fff2] text-[#17633f]",
  refunded: "border-[#ead1d1] bg-[#fff1f1] text-[#9f2b2b]"
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

function formatQuantity(value: number) {
  return quantityFormatter.format(value);
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

  return lines;
}

function getCustomerContactLines(customer: SaleCustomer | null) {
  const lines: ContactLine[] = [];

  if (customer?.phone) {
    lines.push({ label: "Telefone", value: customer.phone });
  }

  if (customer?.email) {
    lines.push({ label: "Email", value: customer.email });
  }

  if (customer?.address) {
    lines.push({ label: "Endereço", value: customer.address });
  }

  return lines;
}

export function SaleDocument({
  companyId,
  companyName,
  saleId
}: SaleDocumentProps) {
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sale, setSale] = useState<Sale | null>(null);

  const loadSale = useCallback(async () => {
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

      const response = await fetch(`${env.apiUrl}/sales/${saleId}`, {
        headers
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar a venda.")
        );
      }

      setSale(payload as Sale);
      setCompanyDetails(await fetchCompanyDetails(headers));
    } catch (currentError) {
      setCompanyDetails(null);
      setSale(null);
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Não foi possível carregar a venda."
      );
    } finally {
      setIsLoading(false);
    }
  }, [companyId, saleId]);

  useEffect(() => {
    void loadSale();
  }, [loadSale]);

  const displayCompanyName = companyDetails?.name ?? companyName;
  const companyContactLines = getCompanyContactLines(companyDetails);
  const customerContactLines = getCustomerContactLines(sale?.customer ?? null);
  const originLabel = sale?.budget?.numberLabel ?? "Venda direta";

  return (
    <main className="sale-print-page min-h-screen bg-[#080a0b] px-4 py-4 sm:px-6 lg:py-8">
      <div className="sale-print-toolbar mx-auto mb-4 flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href="/sales">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void loadSale()}
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
          <Button disabled={!sale} onClick={() => window.print()} type="button">
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir/PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <section className="mx-auto flex min-h-[420px] max-w-6xl items-center justify-center rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando venda
          </span>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="mx-auto max-w-6xl rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] p-6 text-[var(--muted-foreground)]">
          {error}
        </section>
      ) : null}

      {!isLoading && sale ? (
        <section className="sale-document mx-auto max-w-6xl overflow-hidden rounded-lg bg-white text-[#101314] shadow-2xl shadow-black/30">
          <header className="sale-document-cover bg-[rgb(14_17_18)] px-6 py-7 text-[#f7faf8] sm:px-8 lg:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-[#dfe5e3] bg-white">
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="h-10 w-10 object-contain"
                    height={40}
                    priority
                    src="/brand/carbon-flow-logo-on-light-v2.png"
                    width={40}
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ff3c4]">
                    Comprovante de venda
                  </p>
                  <h1 className="mt-3 break-words text-3xl font-semibold leading-tight text-[#f7faf8] sm:text-4xl">
                    {displayCompanyName}
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
                      <span>Documento emitido pelo Carbon Flow.</span>
                    )}
                  </div>
                </div>
              </div>

              <aside className="w-full rounded-md border border-[#31403b] bg-[rgb(255_255_255/0.06)] p-5 lg:max-w-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9ca9a5]">
                      Venda
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-[#f7faf8]">
                      {sale.numberLabel}
                    </p>
                  </div>
                  <span
                    className={[
                      "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                      statusClasses[sale.status]
                    ].join(" ")}
                  >
                    {statusLabels[sale.status]}
                  </span>
                </div>

                <div className="mt-6 border-t border-[#31403b] pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9ca9a5]">
                    Total da venda
                  </p>
                  <strong className="mt-2 block text-4xl font-semibold leading-tight text-[#9ff3c4]">
                    {currencyFormatter.format(sale.totalAmount)}
                  </strong>
                </div>
              </aside>
            </div>
          </header>

          <div className="p-6 sm:p-8 lg:p-10">
            <section className="sale-document-summary grid gap-4 border-b border-[#dfe5e3] pb-7 md:grid-cols-[1.4fr_1fr_1fr]">
              <article className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#17633f]">
                  Cliente
                </p>
                <h2 className="mt-2 break-words text-2xl font-semibold text-[#101314]">
                  {sale.customer?.name ?? "Cliente não informado"}
                </h2>
                <div className="mt-4 grid gap-2 text-sm leading-6 text-[#53615d]">
                  {customerContactLines.length > 0 ? (
                    customerContactLines.map((line) => (
                      <span key={`${line.label}-${line.value}`}>
                        <strong className="font-medium text-[#101314]">
                          {line.label}:
                        </strong>{" "}
                        {line.value}
                      </span>
                    ))
                  ) : (
                    <span>Dados do cliente não informados.</span>
                  )}
                </div>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                  Data da venda
                </p>
                <p className="mt-3 text-lg font-semibold text-[#101314]">
                  {formatDateTime(sale.soldAt)}
                </p>
                <p className="mt-4 text-xs leading-5 text-[#6a7672]">
                  Registro gerado automaticamente após a baixa do estoque.
                </p>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                  Origem
                </p>
                <p className="mt-3 text-lg font-semibold text-[#101314]">
                  {originLabel}
                </p>
                <p className="mt-4 text-xs leading-5 text-[#6a7672]">
                  {sale.budget
                    ? "Venda convertida a partir de orçamento aprovado."
                    : "Venda registrada diretamente no módulo de vendas."}
                </p>
              </article>
            </section>

            <section className="sale-document-items py-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#17633f]">
                    Itens vendidos
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-[#101314]">
                    Produtos e valores
                  </h2>
                </div>
                <p className="text-sm text-[#53615d]">
                  {sale.items.length} {sale.items.length === 1 ? "item" : "itens"}
                </p>
              </div>

              <div className="sale-document-table mt-5 overflow-x-auto rounded-md border border-[#dfe5e3]">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <thead className="bg-[rgb(16_19_20)] text-[#f7faf8]">
                    <tr className="text-xs uppercase tracking-[0.12em]">
                      <th className="px-4 py-3 font-semibold">Produto</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Qtd.
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Valor unit.
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {sale.items.map((item) => (
                      <tr key={item.id}>
                        <td className="max-w-[24rem] break-words px-4 py-4 font-medium text-[#101314]">
                          {item.productName}
                        </td>
                        <td className="px-4 py-4 text-right text-[#53615d]">
                          {formatQuantity(item.quantity)}
                        </td>
                        <td className="px-4 py-4 text-right text-[#53615d]">
                          {currencyFormatter.format(item.unitPrice)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-[#101314]">
                          {currencyFormatter.format(item.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="sale-document-terms grid gap-6 border-t border-[#dfe5e3] pt-7 lg:grid-cols-[1fr_24rem]">
              <div className="grid gap-5">
                <article className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                    Controle operacional
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#53615d]">
                    Esta venda foi registrada no Carbon Flow e os insumos dos
                    produtos vendidos foram baixados automaticamente do estoque.
                  </p>
                </article>

                <article className="rounded-md border border-[#dfe5e3] p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                    Recebimento do cliente
                  </h2>
                  <div className="mt-10 grid gap-6 sm:grid-cols-2">
                    <div>
                      <div className="border-t border-[#9ca9a5]" />
                      <p className="mt-2 text-xs text-[#53615d]">
                        Nome e assinatura
                      </p>
                    </div>
                    <div>
                      <div className="border-t border-[#9ca9a5]" />
                      <p className="mt-2 text-xs text-[#53615d]">Data</p>
                    </div>
                  </div>
                </article>
              </div>

              <aside className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                  Resumo financeiro
                </h2>
                <div className="mt-5 grid gap-3">
                  <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                    <span>Subtotal</span>
                    <strong className="text-[#101314]">
                      {currencyFormatter.format(sale.subtotalAmount)}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                    <span>Desconto</span>
                    <strong className="text-[#101314]">
                      {currencyFormatter.format(sale.discountAmount)}
                    </strong>
                  </div>
                </div>
                <div className="mt-5 border-t border-[#dfe5e3] pt-5">
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                      Total
                    </span>
                    <strong className="text-right text-3xl font-semibold text-[#17633f]">
                      {currencyFormatter.format(sale.totalAmount)}
                    </strong>
                  </div>
                </div>
                <p className="mt-5 rounded-md bg-white p-3 text-xs leading-5 text-[#53615d]">
                  Documento vinculado à venda {sale.numberLabel}.
                </p>
              </aside>
            </section>

            <footer className="mt-10 flex flex-col gap-3 border-t border-[#dfe5e3] pt-5 text-xs leading-5 text-[#6a7672] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Documento gerado pelo Carbon Flow com base na venda registrada e
                nos itens baixados do estoque.
              </span>
              <span className="font-semibold text-[#101314]">
                {sale.numberLabel}
              </span>
            </footer>
          </div>
        </section>
      ) : null}
    </main>
  );
}
