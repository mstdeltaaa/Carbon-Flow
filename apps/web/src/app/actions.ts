"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_COMPANY_COOKIE } from "@/lib/current-company";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const activeCompanyCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production"
};

export async function selectActiveCompanyAction(companyId: string) {
  const cleanCompanyId = companyId.trim();

  if (!cleanCompanyId) {
    return {
      ok: false,
      message: "Empresa inválida."
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      ok: false,
      message: "Supabase não está configurado."
    };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("company_users")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", cleanCompanyId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: "Você não tem acesso a essa empresa."
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_COMPANY_COOKIE,
    cleanCompanyId,
    activeCompanyCookieOptions
  );

  revalidatePath("/", "layout");

  return {
    ok: true,
    message: "Empresa selecionada."
  };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_COMPANY_COOKIE);

  redirect("/login");
}
