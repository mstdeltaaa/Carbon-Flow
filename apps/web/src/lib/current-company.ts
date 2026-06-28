import { cookies } from "next/headers";

import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_COMPANY_COOKIE = "carbon_flow_company_id";

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
};

export type CompanyMembership = {
  id: string;
  companyId: string;
  role: string;
  company: CompanySummary;
};

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
    .select("id, company_id, role, companies(id, name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const memberships = ((data ?? []) as unknown as Array<{
    id: string;
    company_id: string;
    role: string;
    companies: CompanySummary | null;
  }>)
    .filter((membership) => membership.companies)
    .map((membership) => ({
      id: membership.id,
      companyId: membership.company_id,
      role: membership.role,
      company: membership.companies as CompanySummary
    }));

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
    role: membership.role
  };
}
