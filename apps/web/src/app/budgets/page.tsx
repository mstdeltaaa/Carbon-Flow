import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AppShell } from "@/features/app-shell/app-shell";
import { BudgetsManager } from "@/features/budgets/budgets-manager";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function BudgetsPage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      activeItem="budgets"
      activeCompanyId={context.company.id}
      companyName={context.company.name}
      memberships={context.memberships}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "budgets") ? (
        <BudgetsManager companyId={context.company.id} role={context.role} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
