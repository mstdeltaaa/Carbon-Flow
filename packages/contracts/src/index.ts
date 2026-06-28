export type CompanyRole = "admin" | "employee" | "seller";

export type CompanyUserStatus = "active" | "invited" | "disabled";

export type SubscriptionPlan = "free" | "pro" | "enterprise";

export type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

export type SaleStatus = "completed" | "cancelled" | "refunded";

export type StockMovementType = "entry" | "sale" | "adjustment" | "reversal";

export type Money = string;

export type Quantity = string;

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  role: CompanyRole;
};

export type DashboardMetric = {
  revenue: Money;
  salesCount: number;
  estimatedProfit: Money;
  lowStockCount: number;
};

