import { redirect } from "next/navigation";

import { SaleDocument } from "@/features/sales/sale-document";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

type SaleDocumentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SaleDocumentPage({
  params
}: SaleDocumentPageProps) {
  const [context, resolvedParams] = await Promise.all([
    getActiveCompanyContext(),
    params
  ]);

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  if (!canAccessSection(context.role, "sales", context.permissions)) {
    redirect("/");
  }

  return (
    <SaleDocument
      companyId={context.company.id}
      companyName={context.company.name}
      saleId={resolvedParams.id}
    />
  );
}
