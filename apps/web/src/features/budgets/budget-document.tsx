"use client";

import { ArrowLeft, Loader2, Printer, RefreshCcw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
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
  name: string;
  phone: string | null;
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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

function getCompanyContactLines(company: CompanyDetails | null) {
  return [company?.document, company?.phone, company?.email].filter(Boolean);
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

      const response = await fetch(`${env.apiUrl}/budgets/${budgetId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "x-company-id": companyId
        }
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload, "Não foi possível carregar o orçamento.")
        );
      }

      setBudget(payload as Budget);

      try {
        const settingsResponse = await fetch(
          `${env.apiUrl}/companies/settings`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
              "x-company-id": companyId
            }
          }
        );

        if (settingsResponse.ok) {
          const settingsPayload = (await settingsResponse
            .json()
            .catch(() => null)) as { company?: CompanyDetails } | null;

          setCompanyDetails(settingsPayload?.company ?? null);
        } else {
          setCompanyDetails(null);
        }
      } catch {
        setCompanyDetails(null);
      }
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

  return (
    <main className="budget-print-page min-h-screen bg-[#080a0b] px-4 py-4 sm:px-6 lg:py-8">
      <div className="budget-print-toolbar mx-auto mb-4 flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.82)] px-4 text-sm text-white transition hover:bg-[var(--secondary)]"
          href="/budgets"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar
        </Link>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void loadBudget()} type="button" variant="secondary">
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
        <section className="mx-auto flex min-h-[420px] max-w-5xl items-center justify-center rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando orçamento
          </span>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="mx-auto max-w-5xl rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.82)] p-6 text-[var(--muted-foreground)]">
          {error}
        </section>
      ) : null}

      {!isLoading && budget ? (
        <section className="budget-document mx-auto max-w-5xl overflow-hidden rounded-lg bg-white text-[#101314] shadow-2xl shadow-black/30">
          <div className="h-2 bg-[#101314]" />

          <div className="p-6 sm:p-8 lg:p-10">
            <header className="grid gap-8 border-b border-[#dfe5e3] pb-8 md:grid-cols-[1fr_18rem] md:items-start">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[#dfe5e3] bg-[#f7faf8]">
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="h-9 w-9 object-contain"
                    height={40}
                    priority
                    src="/brand/carbon-flow-logo-on-light-v2.png"
                    width={40}
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-[#17633f]">
                    Proposta comercial
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold text-[#101314]">
                    {displayCompanyName}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-[#53615d]">
                    {companyContactLines.length > 0 ? (
                      companyContactLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))
                    ) : (
                      <span>Carbon Flow</span>
                    )}
                  </div>
                </div>
              </div>

              <aside className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-4">
                <p className="text-xs font-semibold uppercase text-[#53615d]">
                  Orçamento
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#101314]">
                  {budget.numberLabel}
                </p>
                <span
                  className={[
                    "mt-4 inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                    statusClasses[budget.status]
                  ].join(" ")}
                >
                  {statusLabels[budget.status]}
                </span>
              </aside>
            </header>

            <section className="grid gap-4 border-b border-[#dfe5e3] py-6 md:grid-cols-4">
              <article className="rounded-md border border-[#dfe5e3] p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase text-[#53615d]">
                  Cliente
                </p>
                <p className="mt-2 text-xl font-semibold text-[#101314]">
                  {budget.customer?.name ?? "Cliente não informado"}
                </p>
                <div className="mt-3 grid gap-1 text-sm leading-6 text-[#53615d]">
                  {budget.customer?.phone ? (
                    <span>{budget.customer.phone}</span>
                  ) : null}
                  {budget.customer?.email ? (
                    <span>{budget.customer.email}</span>
                  ) : null}
                  {budget.customer?.address ? (
                    <span>{budget.customer.address}</span>
                  ) : null}
                  {!budget.customer ? (
                    <span>Dados do cliente não informados.</span>
                  ) : null}
                </div>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-4">
                <p className="text-xs font-semibold uppercase text-[#53615d]">
                  Emissão
                </p>
                <p className="mt-2 text-base font-semibold text-[#101314]">
                  {issuedAt}
                </p>
              </article>

              <article className="rounded-md border border-[#dfe5e3] p-4">
                <p className="text-xs font-semibold uppercase text-[#53615d]">
                  Validade
                </p>
                <p className="mt-2 text-base font-semibold text-[#101314]">
                  {formatDate(budget.validUntil)}
                </p>
              </article>
            </section>

            <section className="py-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#17633f]">
                    Itens da proposta
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-[#101314]">
                    Produtos e valores
                  </h2>
                </div>
                <p className="text-sm text-[#53615d]">
                  {budget.items.length}{" "}
                  {budget.items.length === 1 ? "item" : "itens"}
                </p>
              </div>

              <div className="mt-5 overflow-x-auto rounded-md border border-[#dfe5e3]">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <thead className="bg-[#101314] text-white">
                    <tr className="text-xs uppercase">
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
                        <td className="px-4 py-4 font-medium text-[#101314]">
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

            <section className="grid gap-6 border-t border-[#dfe5e3] pt-7 md:grid-cols-[1fr_22rem]">
              <div>
                <h2 className="text-sm font-semibold uppercase text-[#4d5a56]">
                  Observações e condições
                </h2>
                <p className="mt-3 min-h-24 rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-4 text-sm leading-6 text-[#53615d]">
                  {budget.notes ??
                    "Valores sujeitos às condições comerciais informadas neste documento. A produção começa após aprovação do orçamento."}
                </p>
              </div>

              <aside className="rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-4">
                <div className="flex justify-between gap-4 text-sm text-[#53615d]">
                  <span>Subtotal</span>
                  <strong className="text-[#101314]">
                    {currencyFormatter.format(budget.subtotalAmount)}
                  </strong>
                </div>
                <div className="mt-3 flex justify-between gap-4 text-sm text-[#53615d]">
                  <span>Desconto</span>
                  <strong className="text-[#101314]">
                    {currencyFormatter.format(budget.discountAmount)}
                  </strong>
                </div>
                <div className="mt-4 border-t border-[#dfe5e3] pt-4">
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-semibold uppercase text-[#53615d]">
                      Total
                    </span>
                    <strong className="text-3xl font-semibold text-[#17633f]">
                      {currencyFormatter.format(budget.totalAmount)}
                    </strong>
                  </div>
                </div>
                <p className="mt-4 rounded-md bg-white p-3 text-xs leading-5 text-[#53615d]">
                  Validade da proposta: {formatDate(budget.validUntil)}.
                </p>
              </aside>
            </section>

            <footer className="mt-10 flex flex-col gap-3 border-t border-[#dfe5e3] pt-5 text-xs leading-5 text-[#6a7672] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Documento gerado pelo Carbon Flow. Valores sujeitos às condições
                comerciais informadas no orçamento.
              </span>
              <span className="font-semibold text-[#101314]">
                {budget.numberLabel}
              </span>
            </footer>
          </div>
        </section>
      ) : null}
    </main>
  );
}
