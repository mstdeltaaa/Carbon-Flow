import { BadRequestException, Injectable } from "@nestjs/common";

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
  status: SubscriptionStatus;
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
  constructor(private readonly supabaseFactory: SupabaseClientFactory) {}

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
      .select("plan, status, limits, current_period_end")
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
        .select("plan, status, limits, current_period_end")
        .maybeSingle();

      if (updateError) {
        throwDatabaseError(updateError);
      }

      subscription = (updatedSubscription as SubscriptionRow | null) ?? null;
    }

    return mapSubscription(subscription);
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
