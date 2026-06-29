import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AppShell } from "@/features/app-shell/app-shell";
import { FinanceManager } from "@/features/finance/finance-manager";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function FinancePage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      activeItem="finance"
      activeCompanyId={context.company.id}
      companyName={context.company.name}
      memberships={context.memberships}
      permissions={context.permissions}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "finance", context.permissions) ? (
        <FinanceManager companyId={context.company.id} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
