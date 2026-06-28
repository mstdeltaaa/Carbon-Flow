import { redirect } from "next/navigation";

import { BudgetDocument } from "@/features/budgets/budget-document";
import { canAccessSection } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

type BudgetDocumentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BudgetDocumentPage({
  params
}: BudgetDocumentPageProps) {
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

  if (!canAccessSection(context.role, "budgets")) {
    redirect("/");
  }

  return (
    <BudgetDocument
      budgetId={resolvedParams.id}
      companyId={context.company.id}
      companyName={context.company.name}
    />
  );
}
