import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AppShell } from "@/features/app-shell/app-shell";
import { CustomersManager } from "@/features/customers/customers-manager";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function CustomersPage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      activeItem="customers"
      activeCompanyId={context.company.id}
      companyName={context.company.name}
      memberships={context.memberships}
      permissions={context.permissions}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "customers", context.permissions) ? (
        <CustomersManager companyId={context.company.id} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
