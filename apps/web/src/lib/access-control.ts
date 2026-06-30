export type CompanyRole = "admin" | "employee" | "seller";

export type CompanyPermission =
  | "dashboard"
  | "ingredients"
  | "products"
  | "stock"
  | "customers"
  | "budgets"
  | "sales"
  | "finance";

export type CompanyPermissionMap = Record<CompanyPermission, boolean>;

export type AppSection =
  | CompanyPermission
  | "history"
  | "reports"
  | "billing"
  | "account"
  | "settings";

export const companyPermissions: CompanyPermission[] = [
  "dashboard",
  "ingredients",
  "products",
  "stock",
  "customers",
  "budgets",
  "sales",
  "finance",
];

const employeeDefaultPathOrder: CompanyPermission[] = [
  "dashboard",
  "budgets",
  "sales",
  "customers",
  "products",
  "stock",
  "ingredients",
  "finance",
];

const sellerSections = new Set<AppSection>([
  "customers",
  "products",
  "budgets",
  "account",
]);
const adminSections = new Set<AppSection>([
  "dashboard",
  "ingredients",
  "products",
  "stock",
  "customers",
  "budgets",
  "sales",
  "finance",
  "reports",
  "history",
  "billing",
  "account",
  "settings",
]);

const sectionPaths: Record<CompanyPermission, string> = {
  budgets: "/budgets",
  customers: "/customers",
  dashboard: "/dashboard",
  finance: "/finance",
  ingredients: "/ingredients",
  products: "/products",
  sales: "/sales",
  stock: "/stock",
};

export function createEmptyPermissionMap(): CompanyPermissionMap {
  return companyPermissions.reduce(
    (permissions, permission) => ({
      ...permissions,
      [permission]: false,
    }),
    {} as CompanyPermissionMap,
  );
}

export function createDefaultEmployeePermissionMap(): CompanyPermissionMap {
  return companyPermissions.reduce(
    (permissions, permission) => ({
      ...permissions,
      [permission]: true,
    }),
    {} as CompanyPermissionMap,
  );
}

export function normalizePermissionMap(
  value: unknown,
  fallback: CompanyPermissionMap = createEmptyPermissionMap(),
): CompanyPermissionMap {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  if (!source) {
    return fallback;
  }

  const permissions = createEmptyPermissionMap();

  for (const permission of companyPermissions) {
    permissions[permission] = source[permission] === true;
  }

  return permissions;
}

export function normalizeRole(
  role: string | null | undefined,
): CompanyRole | null {
  if (role === "admin" || role === "employee" || role === "seller") {
    return role;
  }

  return null;
}

export function canAccessSection(
  role: string | null | undefined,
  section: AppSection,
  permissions?: CompanyPermissionMap | null,
) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "admin") {
    return adminSections.has(section);
  }

  if (normalizedRole === "seller") {
    return sellerSections.has(section);
  }

  if (normalizedRole !== "employee") {
    return false;
  }

  if (section === "account") {
    return true;
  }

  if (section === "reports") {
    const employeePermissions =
      permissions ?? createDefaultEmployeePermissionMap();

    return employeePermissions.dashboard;
  }

  if (
    section === "history" ||
    section === "billing" ||
    section === "settings"
  ) {
    return false;
  }

  const employeePermissions =
    permissions ?? createDefaultEmployeePermissionMap();

  return employeePermissions[section];
}

export function getDefaultPathForRole(
  role: string | null | undefined,
  permissions?: CompanyPermissionMap | null,
) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "admin") {
    return "/dashboard";
  }

  if (normalizedRole === "seller") {
    return "/budgets";
  }

  if (normalizedRole === "employee") {
    const firstAllowedSection = employeeDefaultPathOrder.find((section) =>
      canAccessSection(normalizedRole, section, permissions),
    );

    return firstAllowedSection ? sectionPaths[firstAllowedSection] : "/account";
  }

  return "/onboarding";
}

export function canManageProducts(
  role: string | null | undefined,
  permissions?: CompanyPermissionMap | null,
) {
  return canAccessSection(role, "products", permissions) && role !== "seller";
}

export function canConvertBudgets(
  role: string | null | undefined,
  permissions?: CompanyPermissionMap | null,
) {
  return (
    role !== "seller" &&
    canAccessSection(role, "budgets", permissions) &&
    canAccessSection(role, "sales", permissions)
  );
}
