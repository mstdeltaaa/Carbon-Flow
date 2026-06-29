import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AppShell } from "@/features/app-shell/app-shell";
import { BillingManager } from "@/features/billing/billing-manager";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function BillingPage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      activeCompanyId={context.company.id}
      activeItem="billing"
      companyName={context.company.name}
      memberships={context.memberships}
      permissions={context.permissions}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "billing", context.permissions) ? (
        <BillingManager companyId={context.company.id} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
