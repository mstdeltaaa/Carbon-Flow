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

export const companyPermissions: CompanyPermission[] = [
  "dashboard",
  "ingredients",
  "products",
  "stock",
  "customers",
  "budgets",
  "sales",
  "finance"
];

const sellerPermissions = new Set<CompanyPermission>([
  "customers",
  "products",
  "budgets"
]);

export function createEmptyPermissionMap(): CompanyPermissionMap {
  return companyPermissions.reduce(
    (permissions, permission) => ({
      ...permissions,
      [permission]: false
    }),
    {} as CompanyPermissionMap
  );
}

export function createDefaultEmployeePermissionMap(): CompanyPermissionMap {
  return companyPermissions.reduce(
    (permissions, permission) => ({
      ...permissions,
      [permission]: true
    }),
    {} as CompanyPermissionMap
  );
}

export function normalizePermissionMap(value: unknown): CompanyPermissionMap {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const permissions = createEmptyPermissionMap();

  for (const permission of companyPermissions) {
    permissions[permission] = source[permission] === true;
  }

  return permissions;
}

export function getPermissionMapForRole(
  role: string,
  permissions: unknown
): CompanyPermissionMap {
  if (role === "admin") {
    return createDefaultEmployeePermissionMap();
  }

  if (role === "seller") {
    return {
      ...createEmptyPermissionMap(),
      budgets: true,
      customers: true,
      products: true
    };
  }

  if (role === "employee") {
    return normalizePermissionMap(permissions);
  }

  return createEmptyPermissionMap();
}

export function sanitizeEmployeePermissions(
  permissions: unknown
): CompanyPermissionMap {
  return normalizePermissionMap(permissions);
}

export function hasCompanyPermission(
  role: string | undefined,
  permissions: unknown,
  permission: CompanyPermission
) {
  if (role === "admin") {
    return true;
  }

  if (role === "seller") {
    return sellerPermissions.has(permission);
  }

  if (role !== "employee") {
    return false;
  }

  return normalizePermissionMap(permissions)[permission];
}
