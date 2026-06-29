import { cookies } from "next/headers";

import {
  createDefaultEmployeePermissionMap,
  createEmptyPermissionMap,
  normalizePermissionMap,
  type CompanyPermissionMap
} from "@/lib/access-control";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_COMPANY_COOKIE = "carbon_flow_company_id";

export type CompanySummary = {
  id: string;
  logoUrl: string | null;
  name: string;
  slug: string;
};

export type CompanyMembership = {
  id: string;
  companyId: string;
  permissions: CompanyPermissionMap;
  role: string;
  company: CompanySummary;
};

function getPermissionsForRole(role: string, permissions: unknown) {
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
    return normalizePermissionMap(
      permissions,
      createDefaultEmployeePermissionMap()
    );
  }

  return createEmptyPermissionMap();
}

export async function getActiveCompanyContext() {
  if (!hasSupabaseEnv) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("company_users")
    .select("id, company_id, role, permissions, companies(id, name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const memberships: CompanyMembership[] = (
    (data ?? []) as unknown as Array<{
      id: string;
      company_id: string;
      permissions: Record<string, unknown> | null;
      role: string;
      companies: {
        id: string;
        name: string;
        slug: string;
      } | null;
    }>
  )
    .filter((membership) => membership.companies)
    .map((membership) => ({
      id: membership.id,
      companyId: membership.company_id,
      permissions: getPermissionsForRole(
        membership.role,
        membership.permissions
      ),
      role: membership.role,
      company: {
        id: membership.companies!.id,
        logoUrl: null,
        name: membership.companies!.name,
        slug: membership.companies!.slug
      }
    }));

  const companyIds = memberships.map((membership) => membership.companyId);

  if (companyIds.length > 0) {
    const { data: logoRows } = await supabase
      .from("companies")
      .select("id, logo_url")
      .in("id", companyIds);

    for (const row of (logoRows ?? []) as Array<{
      id: string;
      logo_url: string | null;
    }>) {
      const membership = memberships.find((item) => item.companyId === row.id);

      if (membership) {
        membership.company.logoUrl = row.logo_url;
      }
    }
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;
  const membership =
    memberships.find((item) => item.companyId === activeCompanyId) ??
    memberships[0];
  const company = membership?.company;

  if (!membership || !company) {
    return {
      user,
      company: null,
      memberships,
      role: null
    };
  }

  return {
    user,
    company,
    memberships,
    permissions: membership.permissions,
    role: membership.role
  };
}
