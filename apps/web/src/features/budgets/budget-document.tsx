"use client";

import { ArrowLeft, Loader2, Printer, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

type BudgetCustomer = {
  address: string | null;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
};

type BudgetItem = {
  estimatedCost: number;
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
};

type Budget = {
  createdAt: string;
  customer: BudgetCustomer | null;
  discountAmount: number;
  id: string;
  items: BudgetItem[];
  notes: string | null;
  numberLabel: string;
  status: BudgetStatus;
  subtotalAmount: number;
  totalAmount: number;
  validUntil: string | null;
};

type BudgetDocumentProps = {
  budgetId: string;
  companyId: string;
  companyName: string;
};

type CompanyDetails = {
  document: string | null;
  email: string | null;
  logoUrl: string | null;
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

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
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

const statusLabels: Record<BudgetStatus, string> = {
  approved: "Aprovado",
  cancelled: "Cancelado",
  converted: "Convertido",
  draft: "Rascunho",
  expired: "Expirado",
  rejected: "Rejeitado",
  sent: "Enviado"
};

const statusClasses: Record<BudgetStatus, string> = {
  approved: "border-[#bde8cc] bg-[#e9fff2] text-[#17633f]",
  cancelled: "border-[#ead1d1] bg-[#fff1f1] text-[#9f2b2b]",
  converted: "border-[#cbd9f5] bg-[#eef4ff] text-[#284b9b]",
  draft: "border-[#dfe5e3] bg-[#f5f7f6] text-[#4d5a56]",
  expired: "border-[#ead1d1] bg-[#fff1f1] text-[#9f2b2b]",
  rejected: "border-[#ead1d1] bg-[#fff1f1] text-[#9f2b2b]",
  sent: "border-[#f0dfb8] bg-[#fff8e8] text-[#8a5a12]"
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
  const endpoints = ["/companies/document-profile", "/companies/settings"];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${env.apiUrl}${endpoint}`, { headers });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      const company = normalizeCompanyDetails(payload);

      if (company) {
        return company;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(`${value}T00:00:00`));
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

function getCustomerContactLines(customer: BudgetCustomer | null) {
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

export function BudgetDocument({
  budgetId,
  companyId,
  companyName
}: BudgetDocumentProps) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadBudget = useCallback(async () => {
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

      const response = await fetch(`${env.apiUrl}/budgets/${budgetId}`, {
        headers
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar o orçamento.")
        );
      }

      setBudget(payload as Budget);
      setCompanyDetails(await fetchCompanyDetails(headers));
    } catch (currentError) {
      setBudget(null);
      setCompanyDetails(null);
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Não foi possível carregar o orçamento."
      );
    } finally {
      setIsLoading(false);
    }
  }, [budgetId, companyId]);

  useEffect(() => {
    void loadBudget();
  }, [loadBudget]);

  const issuedAt = budget ? formatDateTime(budget.createdAt) : "-";
  const displayCompanyName = companyDetails?.name ?? companyName;
  const companyContactLines = getCompanyContactLines(companyDetails);
  const customerContactLines = getCustomerContactLines(
    budget?.customer ?? null
  );
  const notes =
    budget?.notes?.trim() ||
    "Valores sujeitos às condições comerciais informadas neste documento. A produção começa após aprovação do orçamento.";
  const budgetTerms = [
    "A proposta considera apenas os produtos, quantidades e observações descritos neste documento.",
    "Alterações de escopo, materiais, medidas ou prazo podem gerar revisão de valores.",
    "A produção deve iniciar somente após aprovação do cliente e confirmação das condições comerciais.",
    "Este documento tem finalidade comercial e não substitui documento fiscal quando aplicável."
  ];
  const budgetMetaItems = budget
    ? [
        { label: "Documento", value: "Proposta comercial" },
        { label: "Número", value: budget.numberLabel },
        { label: "Status", value: statusLabels[budget.status] },
        { label: "Emitido em", value: issuedAt }
      ]
    : [];

  useEffect(() => {
    if (!budget) {
      return;
    }

    const previousTitle = document.title;
    document.title = `Orçamento ${budget.numberLabel} - ${displayCompanyName}`;

    return () => {
      document.title = previousTitle;
    };
  }, [budget, displayCompanyName]);

  return (
    <main className="budget-print-page min-h-screen bg-[#080a0b] px-4 py-4 sm:px-6 lg:py-8">
      <div className="budget-print-toolbar mx-auto mb-4 flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href="/budgets">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void loadBudget()}
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
            disabled={!budget}
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
            Carregando orçamento
          </span>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="mx-auto max-w-6xl rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] p-6 text-[var(--muted-foreground)]">
          {error}
        </section>
      ) : null}

      {!isLoading && budget ? (
        <section className="budget-document relative mx-auto max-w-6xl overflow-hidden rounded-lg bg-white text-[#101314] shadow-2xl shadow-black/30">
          <DocumentWatermark text="Proposta" />
          <header className="budget-document-cover relative z-10 bg-[rgb(14_17_18)] px-6 py-7 text-[#f7faf8] sm:px-8 lg:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <DocumentPrimaryLogo
                  companyName={displayCompanyName}
                  logoUrl={companyDetails?.logoUrl}
                />

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ff3c4]">
                    Proposta comercial
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
                      Orçamento
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-[#f7faf8]">
                      {budget.numberLabel}
                    </p>
                  </div>
                  <span
                    className={[
                      "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                      statusClasses[budget.status]
                    ].join(" ")}
                  >
                    {statusLabels[budget.status]}
                  </span>
                </div>

                <div className="mt-6 border-t border-[#31403b] pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9ca9a5]">
                    Total da proposta
                  </p>
                  <strong className="mt-2 block text-4xl font-semibold leading-tight text-[#9ff3c4]">
                    {currencyFormatter.format(budget.totalAmount)}
                  </strong>
                </div>
              </aside>
            </div>
          </header>

          <div className="relative z-10 p-6 sm:p-8 lg:p-10">
            <section className="budget-document-summary grid gap-4 border-b border-[#dfe5e3] pb-7 md:grid-cols-[1.4fr_1fr_1fr]">
              <article className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#17633f]">
                  Cliente
                </p>
                <h2 className="mt-2 break-words text-2xl font-semibold text-[#101314]">
                  {budget.customer?.name ?? "Cliente não informado"}
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
                  Emissão
                </p>
                <p className="mt-3 text-lg font-semibold text-[#101314]">
                  {issuedAt}
                </p>
                <p className="mt-4 text-xs leading-5 text-[#6a7672]">
                  Gerado automaticamente a partir dos dados do Carbon Flow.
                </p>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                  Validade
                </p>
                <p className="mt-3 text-lg font-semibold text-[#101314]">
                  {formatDate(budget.validUntil)}
                </p>
                <p className="mt-4 text-xs leading-5 text-[#6a7672]">
                  A aprovação deve acontecer dentro deste prazo comercial.
                </p>
              </article>
            </section>

            <section className="budget-document-items py-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#17633f]">
                    Itens da proposta
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-[#101314]">
                    Produtos e valores
                  </h2>
                </div>
                <p className="text-sm text-[#53615d]">
                  {budget.items.length}{" "}
                  {budget.items.length === 1 ? "item" : "itens"}
                </p>
              </div>

              <div className="budget-document-table mt-5 overflow-x-auto rounded-md border border-[#dfe5e3]">
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
                    {budget.items.map((item) => (
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

            <section className="budget-document-terms grid gap-6 border-t border-[#dfe5e3] pt-7 lg:grid-cols-[1fr_24rem]">
              <div className="grid gap-5">
                <article>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                    Observações e condições
                  </h2>
                  <p className="mt-3 min-h-24 rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-4 text-sm leading-6 text-[#53615d]">
                    {notes}
                  </p>
                </article>

                <DocumentTermsList
                  items={budgetTerms}
                  title="Condições comerciais"
                />

                <article className="rounded-md border border-[#dfe5e3] p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
                    Aceite do cliente
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
                      {currencyFormatter.format(budget.subtotalAmount)}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                    <span>Desconto</span>
                    <strong className="text-[#101314]">
                      {currencyFormatter.format(budget.discountAmount)}
                    </strong>
                  </div>
                </div>
                <div className="mt-5 border-t border-[#dfe5e3] pt-5">
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-semibold uppercase tracking-[0.14em] text-[#53615d]">
                      Total
                    </span>
                    <strong className="text-right text-3xl font-semibold text-[#17633f]">
                      {currencyFormatter.format(budget.totalAmount)}
                    </strong>
                  </div>
                </div>
                <p className="mt-5 rounded-md bg-white p-3 text-xs leading-5 text-[#53615d]">
                  Validade da proposta: {formatDate(budget.validUntil)}.
                </p>
              </aside>
            </section>

            <DocumentMetaStrip items={budgetMetaItems} />

            <footer className="mt-10 flex flex-col gap-3 border-t border-[#dfe5e3] pt-5 text-xs leading-5 text-[#6a7672] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Documento gerado pelo Carbon Flow com base nos produtos, preços
                e condições cadastrados no orçamento.
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <CarbonDocumentSignature />
                <span className="font-semibold text-[#101314]">
                  {budget.numberLabel}
                </span>
              </div>
            </footer>
          </div>
        </section>
      ) : null}
    </main>
  );
}
