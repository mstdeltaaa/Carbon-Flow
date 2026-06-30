export type SubscriptionPlan = "free" | "pro" | "enterprise";

export type SubscriptionStatus =
  | "active"
  | "inactive"
  | "trialing"
  | "past_due"
  | "cancelled";

export type PlanLimitKey =
  | "users"
  | "ingredients"
  | "products"
  | "customers"
  | "budgets_per_month"
  | "sales_per_month";

export type PlanLimits = Record<PlanLimitKey, number | null>;
export type PlanUsage = Record<PlanLimitKey, number>;

export const planLimitLabels: Record<PlanLimitKey, string> = {
  budgets_per_month: "orçamentos por mês",
  customers: "clientes",
  ingredients: "insumos",
  products: "produtos",
  sales_per_month: "vendas por mês",
  users: "usuários"
};

export const defaultPlanLimits: Record<SubscriptionPlan, PlanLimits> = {
  enterprise: {
    budgets_per_month: null,
    customers: null,
    ingredients: null,
    products: null,
    sales_per_month: null,
    users: null
  },
  free: {
    budgets_per_month: 20,
    customers: 50,
    ingredients: 50,
    products: 20,
    sales_per_month: 20,
    users: 1
  },
  pro: {
    budgets_per_month: 300,
    customers: 500,
    ingredients: 500,
    products: 200,
    sales_per_month: 300,
    users: 5
  }
};

export function createEmptyPlanUsage(): PlanUsage {
  return {
    budgets_per_month: 0,
    customers: 0,
    ingredients: 0,
    products: 0,
    sales_per_month: 0,
    users: 0
  };
}
