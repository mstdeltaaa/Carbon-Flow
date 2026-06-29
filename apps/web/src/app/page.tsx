import { redirect } from "next/navigation";

import { getDefaultPathForRole } from "@/lib/access-control";
import { getActiveCompanyContext } from "@/lib/current-company";

export default async function HomePage() {
  const context = await getActiveCompanyContext();

  if (!context?.user) {
    redirect("/login");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  redirect(getDefaultPathForRole(context.role, context.permissions));
}
