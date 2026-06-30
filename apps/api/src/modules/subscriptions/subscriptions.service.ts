import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import {
  createEmptyPlanUsage,
  defaultPlanLimits,
  planLimitLabels,
  type PlanLimitKey,
  type PlanLimits,
  type PlanUsage,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "./subscription-limits";

type SubscriptionRow = {
  current_period_end: string | null;
  limits: Record<string, unknown> | null;
  plan: SubscriptionPlan;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: SubscriptionStatus;
};

type MercadoPagoPreapprovalResponse = {
  auto_recurring?: {
    currency_id?: string;
    next_payment_date?: string | null;
    transaction_amount?: number;
  };
  back_url?: string;
  external_reference?: string | null;
  id?: string;
  init_point?: string;
  payer_email?: string | null;
  payer_id?: number | string | null;
  sandbox_init_point?: string;
  status?: string;
};

const planLimitKeys: PlanLimitKey[] = [
  "users",
  "ingredients",
  "products",
  "customers",
  "budgets_per_month",
  "sales_per_month",
];

function getCurrentMonthStartIso() {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

function getProTrialEndIso() {
  const trialEnd = new Date();
  trialEnd.setUTCDate(trialEnd.getUTCDate() + 7);

  return trialEnd.toISOString();
}

function getNextMonthlyPeriodEndIso() {
  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  return periodEnd.toISOString();
}

function toCount(value: number | null) {
  return value ?? 0;
}

function normalizeStoredLimit(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "unlimited" || normalized === "ilimitado") {
      return null;
    }

    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return undefined;
}

function mergeLimits(
  plan: SubscriptionPlan,
  storedLimits: Record<string, unknown> | null,
) {
  const limits: PlanLimits = {
    ...defaultPlanLimits[plan],
  };

  for (const key of planLimitKeys) {
    const storedValue = normalizeStoredLimit(storedLimits?.[key]);

    if (storedValue !== undefined) {
      limits[key] = storedValue;
    }
  }

  return limits;
}

function mapSubscription(row: SubscriptionRow | null) {
  const plan = row?.plan ?? "free";

  return {
    currentPeriodEnd: row?.current_period_end ?? null,
    limits: mergeLimits(plan, row?.limits ?? null),
    plan,
    status: row?.status ?? "active",
  };
}

function isExpiredTrial(row: SubscriptionRow | null) {
  if (row?.status !== "trialing" || !row.current_period_end) {
    return false;
  }

  const trialEndsAt = Date.parse(row.current_period_end);

  return Number.isFinite(trialEndsAt) && trialEndsAt <= Date.now();
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Nao foi possivel processar a assinatura.",
  );
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseFactory: SupabaseClientFactory,
  ) {}

  async getOverview(companyId: string) {
    const [subscription, usage] = await Promise.all([
      this.getSubscription(companyId),
      this.getUsage(companyId),
    ]);
    const canCreate = planLimitKeys.reduce(
      (result, key) => {
        const limit = subscription.limits[key];

        result[key] = limit === null || usage[key] < limit;

        return result;
      },
      {} as Record<PlanLimitKey, boolean>,
    );
    const reached = planLimitKeys.filter((key) => {
      const limit = subscription.limits[key];

      return limit !== null && usage[key] >= limit;
    });

    return {
      ...subscription,
      canStartProTrial:
        subscription.plan !== "pro" &&
        subscription.plan !== "enterprise" &&
        !subscription.currentPeriodEnd,
      canCreate,
      reached,
      usage,
    };
  }

  async startProTrial(companyId: string) {
    const subscription = await this.getSubscription(companyId);

    if (subscription.plan === "enterprise") {
      throw new BadRequestException(
        "O plano Empresa deve ser gerenciado pelo suporte.",
      );
    }

    if (subscription.plan === "pro" && subscription.status === "trialing") {
      return this.getOverview(companyId);
    }

    if (subscription.plan === "pro" && subscription.status === "active") {
      throw new BadRequestException("A empresa ja esta no plano Pro.");
    }

    if (subscription.currentPeriodEnd) {
      throw new BadRequestException(
        "O teste gratis do Pro ja foi usado por esta empresa.",
      );
    }

    const supabase = this.supabaseFactory.createAdmin();
    const { error } = await supabase.from("subscriptions").upsert(
      {
        company_id: companyId,
        current_period_end: getProTrialEndIso(),
        limits: defaultPlanLimits.pro,
        plan: "pro",
        status: "trialing",
      },
      { onConflict: "company_id" },
    );

    if (error) {
      throwDatabaseError(error);
    }

    return this.getOverview(companyId);
  }

  async createProCheckout(companyId: string, userEmail?: string) {
    const subscription = await this.getSubscription(companyId);

    if (subscription.plan === "enterprise") {
      throw new BadRequestException(
        "O plano Empresa deve ser gerenciado pelo suporte.",
      );
    }

    if (subscription.plan === "pro" && subscription.status === "active") {
      throw new BadRequestException("A empresa ja esta no plano Pro.");
    }

    if (!userEmail) {
      throw new BadRequestException(
        "Nao foi possivel identificar o email do usuario para o checkout.",
      );
    }

    const preapproval = await this.createMercadoPagoPreapproval(
      companyId,
      this.getMercadoPagoPayerReference(userEmail),
    );
    const checkoutUrl =
      preapproval.init_point ?? preapproval.sandbox_init_point ?? null;

    if (!preapproval.id || !checkoutUrl) {
      throw new BadRequestException(
        "O Mercado Pago nao retornou um link valido para assinatura.",
      );
    }

    await this.saveMercadoPagoReference(companyId, preapproval);

    return {
      checkoutUrl,
      providerSubscriptionId: preapproval.id,
    };
  }

  async syncMercadoPagoSubscription(preapprovalId: string) {
    const preapproval = {
      ...(await this.getMercadoPagoPreapprovalById(preapprovalId)),
      id: preapprovalId,
    };
    const companyId = preapproval.external_reference;

    if (!companyId) {
      throw new BadRequestException(
        "Assinatura do Mercado Pago sem empresa vinculada.",
      );
    }

    const normalizedStatus = preapproval.status?.toLowerCase();
    const supabase = this.supabaseFactory.createAdmin();

    if (normalizedStatus === "authorized") {
      const periodEnd =
        preapproval.auto_recurring?.next_payment_date ??
        getNextMonthlyPeriodEndIso();
      const { error } = await supabase.from("subscriptions").upsert(
        {
          company_id: companyId,
          current_period_end: periodEnd,
          limits: defaultPlanLimits.pro,
          plan: "pro",
          provider: "mercado_pago",
          provider_customer_id: this.getMercadoPagoCustomerId(preapproval),
          provider_subscription_id: preapproval.id,
          status: "active",
        },
        { onConflict: "company_id" },
      );

      if (error) {
        throwDatabaseError(error);
      }

      return { companyId, plan: "pro", status: "active" };
    }

    if (normalizedStatus === "cancelled") {
      const { error } = await supabase.from("subscriptions").upsert(
        {
          company_id: companyId,
          limits: defaultPlanLimits.free,
          plan: "free",
          provider: "mercado_pago",
          provider_customer_id: this.getMercadoPagoCustomerId(preapproval),
          provider_subscription_id: preapproval.id,
          status: "cancelled",
        },
        { onConflict: "company_id" },
      );

      if (error) {
        throwDatabaseError(error);
      }

      return { companyId, plan: "free", status: "cancelled" };
    }

    if (normalizedStatus === "paused") {
      const { error } = await supabase.from("subscriptions").upsert(
        {
          company_id: companyId,
          limits: defaultPlanLimits.free,
          plan: "free",
          provider: "mercado_pago",
          provider_customer_id: this.getMercadoPagoCustomerId(preapproval),
          provider_subscription_id: preapproval.id,
          status: "past_due",
        },
        { onConflict: "company_id" },
      );

      if (error) {
        throwDatabaseError(error);
      }

      return { companyId, plan: "free", status: "past_due" };
    }

    await this.saveMercadoPagoReference(companyId, preapproval);

    return {
      companyId,
      plan: "free",
      status: "inactive",
    };
  }

  async assertCanCreate(companyId: string, resource: PlanLimitKey) {
    const overview = await this.getOverview(companyId);
    const limit = overview.limits[resource];
    const currentUsage = overview.usage[resource];

    if (!["active", "trialing"].includes(overview.status)) {
      throw new BadRequestException(
        "O plano da empresa precisa estar ativo para criar novos registros.",
      );
    }

    if (limit === null || currentUsage < limit) {
      return overview;
    }

    throw new BadRequestException(
      `Seu plano atual permite ate ${limit} ${planLimitLabels[resource]}.`,
    );
  }

  private async getSubscription(companyId: string) {
    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "plan, status, limits, current_period_end, provider, provider_customer_id, provider_subscription_id",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    let subscription = (data as SubscriptionRow | null) ?? null;

    if (isExpiredTrial(subscription)) {
      const { data: updatedSubscription, error: updateError } = await supabase
        .from("subscriptions")
        .update({
          limits: defaultPlanLimits.free,
          plan: "free",
          status: "active",
        })
        .eq("company_id", companyId)
        .select(
          "plan, status, limits, current_period_end, provider, provider_customer_id, provider_subscription_id",
        )
        .maybeSingle();

      if (updateError) {
        throwDatabaseError(updateError);
      }

      subscription = (updatedSubscription as SubscriptionRow | null) ?? null;
    }

    return mapSubscription(subscription);
  }

  private async createMercadoPagoPreapproval(
    companyId: string,
    userEmail: string,
  ) {
    const accessToken = this.getRequiredConfig("MERCADO_PAGO_ACCESS_TOKEN");
    const price = this.getMercadoPagoProPrice();
    const backUrl = this.getAppBackUrl();
    const notificationUrl = this.getMercadoPagoWebhookUrl();
    const payload: Record<string, unknown> = {
      auto_recurring: {
        currency_id:
          this.config.get<string>("MERCADO_PAGO_CURRENCY_ID") ?? "BRL",
        frequency: 1,
        frequency_type: "months",
        transaction_amount: price,
      },
      back_url: backUrl,
      external_reference: companyId,
      payer_email: userEmail,
      reason: "Carbon Flow Pro",
      status: "pending",
    };

    if (notificationUrl) {
      payload.notification_url = notificationUrl;
    }

    return this.mercadoPagoFetch<MercadoPagoPreapprovalResponse>(
      "https://api.mercadopago.com/preapproval",
      {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
  }

  private getMercadoPagoPreapprovalById(preapprovalId: string) {
    const accessToken = this.getRequiredConfig("MERCADO_PAGO_ACCESS_TOKEN");

    return this.mercadoPagoFetch<MercadoPagoPreapprovalResponse>(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(
        preapprovalId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  private async mercadoPagoFetch<T>(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!response.ok) {
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : "Nao foi possivel comunicar com o Mercado Pago.";

      throw new BadRequestException(message);
    }

    return payload as T;
  }

  private async saveMercadoPagoReference(
    companyId: string,
    preapproval: MercadoPagoPreapprovalResponse,
  ) {
    const supabase = this.supabaseFactory.createAdmin();
    const { error } = await supabase.from("subscriptions").upsert(
      {
        company_id: companyId,
        provider: "mercado_pago",
        provider_customer_id: this.getMercadoPagoCustomerId(preapproval),
        provider_subscription_id: preapproval.id,
      },
      { onConflict: "company_id" },
    );

    if (error) {
      throwDatabaseError(error);
    }
  }

  private getMercadoPagoCustomerId(
    preapproval: MercadoPagoPreapprovalResponse,
  ) {
    const customerId = preapproval.payer_id ?? preapproval.payer_email ?? null;

    return customerId === null ? null : String(customerId);
  }

  private getMercadoPagoProPrice() {
    const configuredPrice =
      this.config.get<string>("MERCADO_PAGO_PRO_PRICE") ?? "45";
    const parsedPrice = Number(configuredPrice.replace(",", "."));

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new BadRequestException(
        "MERCADO_PAGO_PRO_PRICE precisa ser um valor maior que zero.",
      );
    }

    return parsedPrice;
  }

  private getAppBackUrl() {
    const configuredBackUrl = this.config.get<string>("MERCADO_PAGO_BACK_URL");

    if (configuredBackUrl) {
      return configuredBackUrl;
    }

    const appUrl =
      this.config.get<string>("NEXT_PUBLIC_APP_URL") ??
      this.config.get<string>("APP_URL");

    if (!appUrl) {
      throw new BadRequestException(
        "Configure NEXT_PUBLIC_APP_URL ou MERCADO_PAGO_BACK_URL na API.",
      );
    }

    return appUrl.replace(/\/$/, "") + "/settings?section=billing";
  }

  private getMercadoPagoWebhookUrl() {
    const configuredWebhookUrl = this.config.get<string>(
      "MERCADO_PAGO_WEBHOOK_URL",
    );

    if (configuredWebhookUrl) {
      return configuredWebhookUrl;
    }

    const apiPublicUrl = this.config.get<string>("API_PUBLIC_URL");

    return apiPublicUrl
      ? apiPublicUrl.replace(/\/$/, "") + "/webhooks/mercado-pago"
      : undefined;
  }

  private getRequiredConfig(key: string) {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new BadRequestException(`Configure ${key} na API.`);
    }

    return value;
  }

  private getMercadoPagoPayerReference(userEmail: string) {
    const accessToken = this.getRequiredConfig("MERCADO_PAGO_ACCESS_TOKEN");
    const testPayerEmail = this.config.get<string>(
      "MERCADO_PAGO_TEST_PAYER_EMAIL",
    );

    if (accessToken.startsWith("TEST-")) {
      if (!testPayerEmail) {
        throw new BadRequestException(
          "Configure MERCADO_PAGO_TEST_PAYER_EMAIL com o email do comprador teste do Mercado Pago. O campo Usuario serve apenas para login no checkout.",
        );
      }

      return testPayerEmail;
    }

    return userEmail;
  }

  private async getUsage(companyId: string) {
    const supabase = this.supabaseFactory.createAdmin();
    const monthStart = getCurrentMonthStartIso();
    const usage = createEmptyPlanUsage();

    const [users, ingredients, products, customers, budgets, sales] =
      await Promise.all([
        supabase
          .from("company_users")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .neq("status", "disabled"),
        supabase
          .from("ingredients")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("budgets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", monthStart),
        supabase
          .from("sales")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", monthStart),
      ]);

    for (const result of [
      users,
      ingredients,
      products,
      customers,
      budgets,
      sales,
    ]) {
      if (result.error) {
        throwDatabaseError(result.error);
      }
    }

    usage.users = toCount(users.count);
    usage.ingredients = toCount(ingredients.count);
    usage.products = toCount(products.count);
    usage.customers = toCount(customers.count);
    usage.budgets_per_month = toCount(budgets.count);
    usage.sales_per_month = toCount(sales.count);

    return usage;
  }
}
