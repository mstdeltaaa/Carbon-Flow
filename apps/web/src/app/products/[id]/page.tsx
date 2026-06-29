import { redirect } from "next/navigation";

import { ProductTechnicalSheet } from "@/features/products/product-technical-sheet";
import { canManageProducts } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

type ProductTechnicalSheetPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductTechnicalSheetPage({
  params
}: ProductTechnicalSheetPageProps) {
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

  if (!canManageProducts(context.role, context.permissions)) {
    redirect("/products");
  }

  return (
    <ProductTechnicalSheet
      companyId={context.company.id}
      companyName={context.company.name}
      productId={resolvedParams.id}
    />
  );
}
