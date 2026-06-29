export type CompanyRole = "admin" | "employee" | "seller";

export type AppSection =
  | "dashboard"
  | "ingredients"
  | "products"
  | "stock"
  | "customers"
  | "budgets"
  | "sales"
  | "finance"
  | "history"
  | "billing"
  | "account"
  | "settings";

const defaultPaths: Record<CompanyRole, string> = {
  admin: "/dashboard",
  employee: "/dashboard",
  seller: "/budgets"
};

const sectionPermissions: Record<CompanyRole, AppSection[]> = {
  admin: [
    "dashboard",
    "ingredients",
    "products",
    "stock",
    "customers",
    "budgets",
    "sales",
    "finance",
    "history",
    "billing",
    "account",
    "settings"
  ],
  employee: [
    "dashboard",
    "ingredients",
    "products",
    "stock",
    "customers",
    "budgets",
    "sales",
    "finance",
    "account"
  ],
  seller: ["customers", "products", "budgets", "account"]
};

export function normalizeRole(role: string | null | undefined): CompanyRole | null {
  if (role === "admin" || role === "employee" || role === "seller") {
    return role;
  }

  return null;
}

export function canAccessSection(
  role: string | null | undefined,
  section: AppSection
) {
  const normalizedRole = normalizeRole(role);

  return normalizedRole
    ? sectionPermissions[normalizedRole].includes(section)
    : false;
}

export function getDefaultPathForRole(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  return normalizedRole ? defaultPaths[normalizedRole] : "/onboarding";
}

export function canManageProducts(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  return normalizedRole === "admin" || normalizedRole === "employee";
}

export function canConvertBudgets(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  return normalizedRole === "admin" || normalizedRole === "employee";
}
