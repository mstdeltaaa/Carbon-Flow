import { redirect } from "next/navigation";

import { AccessDenied } from "@/features/access/access-denied";
import { AppShell } from "@/features/app-shell/app-shell";
import { ProductsManager } from "@/features/products/products-manager";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function ProductsPage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      activeItem="products"
      activeCompanyId={context.company.id}
      companyName={context.company.name}
      memberships={context.memberships}
      role={context.role}
      userEmail={context.user.email ?? "Usuário autenticado"}
    >
      {canAccessSection(context.role, "products") ? (
        <ProductsManager companyId={context.company.id} role={context.role} />
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  );
}
