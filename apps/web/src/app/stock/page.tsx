import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AppShell } from "@/features/app-shell/app-shell";
import { StockManager } from "@/features/stock/stock-manager";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function StockPage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      activeItem="stock"
      activeCompanyId={context.company.id}
      companyName={context.company.name}
      memberships={context.memberships}
      permissions={context.permissions}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "stock", context.permissions) ? (
        <StockManager companyId={context.company.id} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
