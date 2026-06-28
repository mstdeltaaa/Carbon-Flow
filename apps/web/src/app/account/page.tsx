import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AccountManager } from "@/features/account/account-manager";
import { AppShell } from "@/features/app-shell/app-shell";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function AccountPage() {
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
      activeItem="account"
      companyName={context.company.name}
      memberships={context.memberships}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "account") ? (
        <AccountManager companyName={context.company.name} role={context.role} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
