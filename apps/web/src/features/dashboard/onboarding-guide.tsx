"use client";

import {
  Boxes,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  PackageCheck,
  ShoppingCart,
  UserRound
} from "lucide-react";
import Link from "next/link";

import {
  storeAssistantAction,
  type AssistantActionId
} from "@/features/assistant/assistant-actions";

export type DashboardOnboardingSummary = {
  completedSteps: number;
  counts: {
    budgets: number;
    company: number;
    customers: number;
    ingredients: number;
    products: number;
    sales: number;
  };
  isComplete: boolean;
  progress: number;
  totalSteps: number;
};

type OnboardingGuideProps = {
  canAccessSettings: boolean;
  isLoading: boolean;
  onboarding: DashboardOnboardingSummary | undefined;
};

const emptyCounts: DashboardOnboardingSummary["counts"] = {
  budgets: 0,
  company: 1,
  customers: 0,
  ingredients: 0,
  products: 0,
  sales: 0
};

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function OnboardingGuide({
  canAccessSettings,
  isLoading,
  onboarding
}: OnboardingGuideProps) {
  const counts = onboarding?.counts ?? emptyCounts;
  const progress = onboarding?.progress ?? 0;
  const completedSteps = onboarding?.completedSteps ?? 0;
  const totalSteps = onboarding?.totalSteps ?? 6;
  const isComplete = onboarding?.isComplete ?? false;
  const companyHref = canAccessSettings ? "/settings" : "/account";

  const steps = [
    {
      actionLabel: canAccessSettings ? "Revisar empresa" : "Ver conta",
      completed: counts.company > 0,
      countLabel: "Empresa ativa",
      description: "Base da conta, assinatura, equipe e dados comerciais.",
      href: companyHref,
      icon: Building2,
      title: "Configurar empresa"
    },
    {
      actionId: "create-ingredient" as AssistantActionId,
      actionLabel: counts.ingredients > 0 ? "Ver insumos" : "Cadastrar insumo",
      completed: counts.ingredients > 0,
      countLabel: formatCount(counts.ingredients, "insumo", "insumos"),
      description: "Cadastre matérias-primas com unidade, custo e estoque.",
      href: "/ingredients",
      icon: Boxes,
      title: "Cadastrar primeiro insumo"
    },
    {
      actionId: "create-product" as AssistantActionId,
      actionLabel: counts.products > 0 ? "Ver produtos" : "Criar produto",
      completed: counts.products > 0,
      countLabel: formatCount(counts.products, "produto", "produtos"),
      description: "Monte a composição e veja custo, margem e preço.",
      href: "/products",
      icon: PackageCheck,
      title: "Criar primeiro produto"
    },
    {
      actionId: "create-customer" as AssistantActionId,
      actionLabel: counts.customers > 0 ? "Ver clientes" : "Cadastrar cliente",
      completed: counts.customers > 0,
      countLabel: formatCount(counts.customers, "cliente", "clientes"),
      description: "Salve contatos para orçamentos e histórico de compras.",
      href: "/customers",
      icon: UserRound,
      title: "Cadastrar cliente"
    },
    {
      actionId: "create-budget" as AssistantActionId,
      actionLabel: counts.budgets > 0 ? "Ver orçamentos" : "Criar orçamento",
      completed: counts.budgets > 0,
      countLabel: formatCount(counts.budgets, "orçamento", "orçamentos"),
      description: "Gere uma proposta profissional para o cliente.",
      href: "/budgets",
      icon: FileText,
      title: "Criar orçamento"
    },
    {
      actionId: "create-sale" as AssistantActionId,
      actionLabel: counts.sales > 0 ? "Ver vendas" : "Registrar venda",
      completed: counts.sales > 0,
      countLabel: formatCount(counts.sales, "venda", "vendas"),
      description:
        "Confirme a venda para baixar estoque e registrar financeiro.",
      href: "/sales",
      icon: ShoppingCart,
      title: "Registrar primeira venda"
    }
  ];

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-foreground)]">
            Primeiro acesso
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Guia para colocar o Carbon Flow em operação
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Siga os passos principais para sair da empresa criada até a primeira
            venda com baixa automática de estoque.
          </p>
        </div>

        <div className="w-full rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 lg:max-w-xs">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase text-[var(--muted-foreground)]">
                Progresso
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {isLoading ? "--" : `${progress}%`}
              </p>
            </div>
            <span className="rounded-md bg-[rgb(159_243_196/0.1)] px-2 py-1 text-xs text-[var(--primary)]">
              {isLoading
                ? "Carregando"
                : `${completedSteps}/${totalSteps} passos`}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${isLoading ? 12 : progress}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
            {isComplete
              ? "Fluxo inicial pronto. Agora os relatórios começam a ganhar força."
              : "Complete os passos para liberar uma operação mais consistente."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          const StatusIcon = step.completed ? CheckCircle2 : Circle;

          return (
            <article
              className="grid gap-4 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 sm:grid-cols-[2.5rem_1fr_auto] sm:items-center"
              key={step.title}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[rgb(16_19_20/0.68)] text-[var(--primary)]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIcon
                    className={[
                      "h-4 w-4",
                      step.completed
                        ? "text-[var(--primary)]"
                        : "text-[var(--muted-foreground)]"
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-semibold text-white">
                    {step.title}
                  </h3>
                  <span className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                    {step.countLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                  {step.description}
                </p>
              </div>

              <Link
                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-[var(--border)] px-3 text-sm font-medium text-white transition hover:bg-[var(--secondary)] sm:w-auto"
                href={step.href}
                onClick={() => {
                  if (step.actionId) {
                    storeAssistantAction(step.actionId);
                  }
                }}
              >
                {step.actionLabel}
              </Link>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 text-sm leading-6 text-[var(--muted-foreground)]">
        <ClipboardList
          className="mt-1 h-4 w-4 shrink-0 text-[var(--primary)]"
          aria-hidden="true"
        />
        <p>
          O guia usa os registros reais da empresa. Quando um item é cadastrado,
          o passo fica concluído automaticamente ao voltar para o dashboard.
        </p>
      </div>
    </section>
  );
}
