"use client";

import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SubscriptionPlan = "free" | "pro" | "enterprise";
type SubscriptionStatus =
  "active" | "inactive" | "trialing" | "past_due" | "cancelled";
type PlanLimitKey =
  | "users"
  | "ingredients"
  | "products"
  | "customers"
  | "budgets_per_month"
  | "sales_per_month";
type PlanLimits = Record<PlanLimitKey, number | null>;
type PlanUsage = Record<PlanLimitKey, number>;
type BillingMode = "pix" | "recurring" | "trial" | null;

type Subscription = {
  billingMode: BillingMode;
  canCancelProSubscription: boolean;
  canStartProTrial: boolean;
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  usage: PlanUsage;
};

type SettingsPayload = {
  subscription: Subscription;
};

type CheckoutPayload = {
  checkoutUrl: string;
  providerSubscriptionId: string;
};

type PixPaymentPayload = {
  amount: number;
  currencyId: string;
  expiresAt: string | null;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string | null;
  status: string;
  ticketUrl: string | null;
};

type BillingManagerProps = {
  companyId: string;
};

type PlanCard = {
  description: string;
  features: string[];
  id: SubscriptionPlan;
  label: string;
  price: string;
};

const plans: PlanCard[] = [
  {
    description: "Para validar o fluxo e controlar uma operação pequena.",
    features: [
      "1 usuário",
      "50 insumos",
      "20 produtos",
      "50 clientes",
      "20 orçamentos por mês",
      "20 vendas por mês",
    ],
    id: "free",
    label: "Free",
    price: "Grátis",
  },
  {
    description:
      "Para empresas que já operam com equipe e volume recorrente. Comece com 7 dias grátis e depois continue por R$ 45/mês.",
    features: [
      "5 usuários",
      "500 insumos",
      "200 produtos",
      "500 clientes",
      "300 orçamentos por mês",
      "300 vendas por mês",
      "7 dias grátis para começar",
    ],
    id: "pro",
    label: "Pro",
    price: "R$ 45/mês",
  },
  {
    description: "Para operações com várias pessoas e necessidade de escala.",
    features: [
      "Usuários ilimitados",
      "Insumos ilimitados",
      "Produtos ilimitados",
      "Clientes ilimitados",
      "Orçamentos ilimitados",
      "Vendas ilimitadas",
    ],
    id: "enterprise",
    label: "Empresa",
    price: "Sob consulta",
  },
];

const planLabels: Record<SubscriptionPlan, string> = {
  enterprise: "Empresa",
  free: "Free",
  pro: "Pro",
};

const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  active: "Ativo",
  cancelled: "Cancelado",
  inactive: "Inativo",
  past_due: "Pagamento pendente",
  trialing: "Teste",
};

const usageOrder: PlanLimitKey[] = [
  "users",
  "ingredients",
  "products",
  "customers",
  "budgets_per_month",
  "sales_per_month",
];
const millisecondsInDay = 24 * 60 * 60 * 1000;

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

function getLimitLabel(key: PlanLimitKey) {
  const labels: Record<PlanLimitKey, string> = {
    budgets_per_month: "Orçamentos/mês",
    customers: "Clientes",
    ingredients: "Insumos",
    products: "Produtos",
    sales_per_month: "Vendas/mês",
    users: "Usuários",
  };

  return labels[key];
}

function formatLimit(limit: number | null) {
  return limit === null ? "Ilimitado" : String(limit);
}

function getUsagePercent(usage: number, limit: number | null) {
  if (limit === null) {
    return 0;
  }

  if (limit <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((usage / limit) * 100));
}

function getTrialDaysLeft(currentPeriodEnd: string | null) {
  if (!currentPeriodEnd) {
    return null;
  }

  const endsAt = Date.parse(currentPeriodEnd);

  if (!Number.isFinite(endsAt)) {
    return null;
  }

  return Math.max(0, Math.ceil((endsAt - Date.now()) / millisecondsInDay));
}

function getTrialLabel(currentPeriodEnd: string | null) {
  const daysLeft = getTrialDaysLeft(currentPeriodEnd);

  if (daysLeft === null) {
    return "Teste grátis ativo";
  }

  if (daysLeft === 0) {
    return "Termina hoje";
  }

  return daysLeft === 1 ? "1 dia restante" : `${daysLeft} dias restantes`;
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatCurrency(value: number, currencyId = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    currency: currencyId,
    style: "currency",
  }).format(value);
}

export function BillingManager({ companyId }: BillingManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isCancellingSubscription, setIsCancellingSubscription] =
    useState(false);
  const [isPixAction, setIsPixAction] = useState(false);
  const [isSyncingPix, setIsSyncingPix] = useState(false);
  const [planAction, setPlanAction] = useState<SubscriptionPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pixPayment, setPixPayment] = useState<PixPaymentPayload | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
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
        },
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(getApiMessage(payload, "Não foi possível carregar."));
      }

      return payload as T;
    },
    [companyId],
  );

  const currentPlan = subscription?.plan ?? "free";
  const isTrialing = subscription?.status === "trialing";
  const currentPlanName =
    isTrialing && currentPlan === "pro"
      ? "Pro grátis"
      : subscription?.status === "cancelled" && currentPlan === "pro"
        ? "Pro cancelado"
        : planLabels[currentPlan];
  const currentStatus = subscription
    ? isTrialing
      ? getTrialLabel(subscription.currentPeriodEnd)
      : subscription.status === "cancelled" && currentPlan === "pro"
        ? formatDate(subscription.currentPeriodEnd)
          ? `Ativo até ${formatDate(subscription.currentPeriodEnd)}`
          : "Cancelado"
        : subscriptionStatusLabels[subscription.status]
    : "Carregando";
  const trialEndDate =
    subscription && isTrialing
      ? formatDate(subscription.currentPeriodEnd)
      : null;

  const reachedLimits = useMemo(() => {
    if (!subscription) {
      return 0;
    }

    return usageOrder.filter((key) => {
      const limit = subscription.limits[key];

      return limit !== null && subscription.usage[key] >= limit;
    }).length;
  }, [subscription]);

  useEffect(() => {
    async function loadBilling() {
      setIsLoading(true);
      setMessage(null);

      try {
        const data = await request<SettingsPayload>("/companies/settings");
        setSubscription(data.subscription);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os planos.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadBilling();
  }, [request]);

  async function handleUpgradeClick(plan: SubscriptionPlan) {
    const label = planLabels[plan];

    if (plan === "pro" && subscription?.canStartProTrial) {
      setPlanAction(plan);
      setMessage(null);

      try {
        const updatedSubscription = await request<Subscription>(
          "/subscriptions/pro-trial",
          { method: "POST" },
        );

        setSubscription(updatedSubscription);
        setMessage(
          "Teste grátis do Pro iniciado. Os limites maiores já estão ativos para esta empresa.",
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar o teste grátis.",
        );
      } finally {
        setPlanAction(null);
      }

      return;
    }

    if (plan === "pro" && subscription && !subscription.canStartProTrial) {
      setPlanAction(plan);
      setMessage(null);

      try {
        const checkout = await request<CheckoutPayload>(
          "/subscriptions/checkout/pro",
          { method: "POST" },
        );

        setMessage("Abrindo checkout seguro do Mercado Pago.");
        window.location.assign(checkout.checkoutUrl);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível abrir o checkout do Mercado Pago.",
        );
        setPlanAction(null);
      }

      return;
    }

    setMessage(
      `Solicitação para o plano ${label} registrada. O próximo passo é conectar Mercado Pago ou Stripe.`,
    );
  }

  async function handleProPixClick() {
    setIsPixAction(true);
    setMessage(null);
    setPixPayment(null);

    try {
      const payment = await request<PixPaymentPayload>(
        "/subscriptions/checkout/pro-pix",
        { method: "POST" },
      );

      setPixPayment(payment);
      setMessage(
        "Pix gerado. Depois do pagamento, o Pro será liberado por 1 mês.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o Pix do Pro.",
      );
    } finally {
      setIsPixAction(false);
    }
  }

  async function handleCancelSubscription() {
    if (!subscription?.canCancelProSubscription) {
      return;
    }

    const periodEnd = formatDate(subscription.currentPeriodEnd);
    const confirmed = window.confirm(
      periodEnd
        ? `Cancelar a renovação do Pro? A empresa continua com acesso até ${periodEnd}.`
        : "Cancelar a renovação do Pro?",
    );

    if (!confirmed) {
      return;
    }

    setIsCancellingSubscription(true);
    setMessage(null);

    try {
      const updatedSubscription = await request<Subscription>(
        "/subscriptions/cancel-pro",
        { method: "POST" },
      );

      setSubscription(updatedSubscription);
      setMessage(
        formatDate(updatedSubscription.currentPeriodEnd)
          ? `Assinatura cancelada. O Pro continua ativo até ${formatDate(
              updatedSubscription.currentPeriodEnd,
            )}.`
          : "Assinatura cancelada.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível cancelar a assinatura.",
      );
    } finally {
      setIsCancellingSubscription(false);
    }
  }

  async function handleCopyPixCode() {
    if (!pixPayment) {
      return;
    }

    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      setMessage("Código Pix copiado.");
    } catch {
      setMessage("Não foi possível copiar automaticamente o código Pix.");
    }
  }

  async function handleRefreshPixPayment() {
    if (!pixPayment) {
      return;
    }

    setIsSyncingPix(true);
    setMessage(null);

    try {
      const updatedSubscription = await request<Subscription>(
        `/subscriptions/checkout/pro-pix/${pixPayment.paymentId}/sync`,
        { method: "POST" },
      );

      setSubscription(updatedSubscription);

      if (
        updatedSubscription.plan === "pro" &&
        updatedSubscription.status === "active"
      ) {
        setPixPayment(null);
        setMessage("Pagamento confirmado. O plano Pro está ativo.");
        return;
      }

      setMessage("Ainda não identificamos a confirmação do Pix.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o status do Pix.",
      );
    } finally {
      setIsSyncingPix(false);
    }
  }

  return (
    <>
      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[var(--primary)]">Assinatura</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Planos e upgrade
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Gerencie o plano da empresa ativa e acompanhe os limites de uso.
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:min-w-[24rem] xl:min-w-[28rem]">
            <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
              <p className="text-xs text-[var(--muted-foreground)]">
                Plano atual
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                {currentPlanName}
              </p>
            </article>
            <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
              <p className="text-xs text-[var(--muted-foreground)]">Status</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {currentStatus}
              </p>
            </article>
          </div>
        </div>
      </section>

      {message ? (
        <p className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      {pixPayment ? (
        <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-[var(--primary)]">Pix mensal</p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Pro por 1 mês
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                Valor:{" "}
                <span className="font-medium text-white">
                  {formatCurrency(pixPayment.amount, pixPayment.currencyId)}
                </span>
                {formatDateTime(pixPayment.expiresAt)
                  ? ` • vence em ${formatDateTime(pixPayment.expiresAt)}`
                  : ""}
              </p>
            </div>

            {pixPayment.qrCodeBase64 ? (
              <div className="flex justify-start lg:justify-end">
                <img
                  alt="QR Code Pix do plano Pro"
                  className="h-44 w-44 rounded-md border border-[var(--border)] bg-white p-2"
                  src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                />
              </div>
            ) : null}
          </div>

          <textarea
            className="mt-5 min-h-28 w-full resize-none rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.52)] p-3 text-xs leading-5 text-white outline-none"
            readOnly
            value={pixPayment.qrCode}
          />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button onClick={handleCopyPixCode} type="button">
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar código Pix
            </Button>
            <Button
              disabled={isSyncingPix}
              onClick={handleRefreshPixPayment}
              type="button"
              variant="secondary"
            >
              {isSyncingPix ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Já paguei
            </Button>
            {pixPayment.ticketUrl ? (
              <Button asChild type="button" variant="secondary">
                <a href={pixPayment.ticketUrl} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Abrir pagamento
                </a>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="flex min-h-[18rem] items-center justify-center rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-8 text-[var(--muted-foreground)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Carregando planos
        </section>
      ) : subscription ? (
        <>
          {isTrialing ? (
            <section className="rounded-lg border border-[rgb(159_243_196/0.32)] bg-[rgb(159_243_196/0.09)] p-5 text-sm text-[var(--muted-foreground)] sm:p-6">
              <p className="font-medium text-white">
                Teste grátis do Pro ativo
              </p>
              <p className="mt-2 leading-6">
                Você está usando os limites do plano Pro por 7 dias. Quando o
                teste terminar{trialEndDate ? ` em ${trialEndDate}` : ""}, a
                empresa volta automaticamente para o Free.
              </p>
            </section>
          ) : null}

          {subscription.status === "cancelled" && currentPlan === "pro" ? (
            <section className="rounded-lg border border-[rgb(250_204_21/0.3)] bg-[rgb(250_204_21/0.08)] p-5 text-sm text-[var(--muted-foreground)] sm:p-6">
              <p className="font-medium text-white">Renovação cancelada</p>
              <p className="mt-2 leading-6">
                A empresa continua usando o Pro
                {formatDate(subscription.currentPeriodEnd)
                  ? ` até ${formatDate(subscription.currentPeriodEnd)}`
                  : ""}{" "}
                e depois volta automaticamente para o Free.
              </p>
            </section>
          ) : null}

          <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Uso atual
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {reachedLimits > 0
                    ? `${reachedLimits} limite atingido`
                    : "Tudo dentro dos limites do plano"}
                </p>
              </div>
              <CreditCard
                className="hidden h-5 w-5 text-[var(--primary)] sm:block"
                aria-hidden="true"
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {usageOrder.map((key) => {
                const usage = subscription.usage[key];
                const limit = subscription.limits[key];
                const percent = getUsagePercent(usage, limit);
                const reached = limit !== null && usage >= limit;

                return (
                  <article
                    className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4"
                    key={key}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {getLimitLabel(key)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {usage} / {formatLimit(limit)}
                        </p>
                      </div>
                      {reached ? (
                        <span className="rounded-md bg-[rgb(239_68_68/0.14)] px-2 py-1 text-xs text-red-300">
                          Limite
                        </span>
                      ) : null}
                    </div>
                    {limit !== null ? (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    ) : (
                      <div className="mt-3 h-2 rounded-full bg-[rgb(159_243_196/0.2)]" />
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isProTrialCard =
                plan.id === "pro" && subscription.status === "trialing";
              const isFeatured = plan.id === "pro";
              const isStartingPlan = planAction === plan.id;
              const shouldShowPixButton =
                plan.id === "pro" && subscription.billingMode !== "recurring";
              const canStartTrial =
                plan.id === "pro" && Boolean(subscription.canStartProTrial);

              return (
                <article
                  className="flex min-h-[28rem] flex-col rounded-lg border border-transparent bg-[rgb(16_19_20/0.78)] p-5 transition hover:border-[var(--primary)] hover:shadow-2xl hover:shadow-[color:var(--shadow-color)] focus-within:border-[var(--primary)] focus-within:shadow-2xl focus-within:shadow-[color:var(--shadow-color)] sm:p-6"
                  key={plan.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        {plan.label}
                      </h2>
                      <p className="mt-2 text-2xl font-semibold text-[var(--primary)]">
                        {plan.price}
                      </p>
                    </div>
                    {isFeatured ? (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(159_243_196/0.12)] text-[var(--primary)]">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(255_255_255/0.06)] text-[var(--muted-foreground)]">
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                    {plan.description}
                  </p>

                  <ul className="mt-5 grid gap-3 text-sm text-white">
                    {plan.features.map((feature) => (
                      <li className="flex gap-2" key={feature}>
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-6">
                    {isCurrent && !isProTrialCard ? (
                      <Button className="w-full" disabled type="button">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Plano atual
                      </Button>
                    ) : plan.id === "enterprise" ? (
                      <Button
                        disabled={Boolean(planAction)}
                        className="w-full"
                        onClick={() => handleUpgradeClick(plan.id)}
                        type="button"
                        variant="secondary"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        Falar com suporte
                      </Button>
                    ) : (
                      <Button
                        disabled={Boolean(planAction)}
                        className="w-full"
                        onClick={() => handleUpgradeClick(plan.id)}
                        type="button"
                      >
                        {isStartingPlan ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isStartingPlan
                          ? "Iniciando..."
                          : canStartTrial
                            ? "Iniciar teste grátis"
                            : isProTrialCard
                              ? "Assinar Pro agora"
                              : plan.id === "pro"
                                ? "Assinar Pro"
                                : "Solicitar upgrade"}
                      </Button>
                    )}
                    {plan.id === "pro" ? (
                      <>
                        {subscription.canCancelProSubscription ? (
                          <Button
                            className="mt-2 w-full"
                            disabled={
                              Boolean(planAction) || isCancellingSubscription
                            }
                            onClick={handleCancelSubscription}
                            type="button"
                            variant="secondary"
                          >
                            {isCancellingSubscription ? (
                              <Loader2
                                className="h-4 w-4 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <XCircle className="h-4 w-4" aria-hidden="true" />
                            )}
                            {isCancellingSubscription
                              ? "Cancelando..."
                              : "Cancelar assinatura"}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {shouldShowPixButton ? (
                      <Button
                        className="mt-2 w-full"
                        disabled={
                          Boolean(planAction) || isPixAction || isSyncingPix
                        }
                        onClick={handleProPixClick}
                        type="button"
                        variant="secondary"
                      >
                        {isPixAction ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <QrCode className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isPixAction
                          ? "Gerando Pix..."
                          : currentPlan === "pro" &&
                              subscription.status === "active"
                            ? "Adicionar 1 mês com Pix"
                            : isProTrialCard
                              ? "Garantir 1 mês com Pix"
                              : "Pagar 1 mês com Pix"}
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-white">
              Pagamentos futuros
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {["Checkout", "Webhook", "Atualização do plano"].map((item) => (
                <article
                  className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4 text-sm text-[var(--muted-foreground)]"
                  key={item}
                >
                  {item}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
