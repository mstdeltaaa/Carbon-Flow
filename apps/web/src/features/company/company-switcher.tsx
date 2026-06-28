"use client";

import { Building2, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { selectActiveCompanyAction } from "@/app/actions";
import {
  canAccessSection,
  getDefaultPathForRole,
  type AppSection
} from "@/lib/access-control";
import type { CompanyMembership } from "@/lib/current-company";

const sectionRoutes: Array<{ prefix: string; section: AppSection }> = [
  { prefix: "/dashboard", section: "dashboard" },
  { prefix: "/ingredients", section: "ingredients" },
  { prefix: "/products", section: "products" },
  { prefix: "/stock", section: "stock" },
  { prefix: "/customers", section: "customers" },
  { prefix: "/budgets", section: "budgets" },
  { prefix: "/sales", section: "sales" },
  { prefix: "/history", section: "history" },
  { prefix: "/billing", section: "billing" },
  { prefix: "/account", section: "account" },
  { prefix: "/settings", section: "settings" }
];

const roleLabels: Record<string, string> = {
  admin: "Admin",
  employee: "Funcionário",
  seller: "Vendedor"
};

type CompanySwitcherProps = {
  activeCompanyId: string;
  memberships: CompanyMembership[];
};

function getPathAfterCompanyChange(pathname: string, role: string) {
  if (pathname.startsWith("/budgets/")) {
    return "/budgets";
  }

  const currentSection = sectionRoutes.find((route) =>
    pathname.startsWith(route.prefix)
  )?.section;

  if (currentSection && canAccessSection(role, currentSection)) {
    return pathname;
  }

  return getDefaultPathForRole(role);
}

export function CompanySwitcher({
  activeCompanyId,
  memberships
}: CompanySwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedCompanyId, setSelectedCompanyId] = useState(activeCompanyId);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedCompanyId(activeCompanyId);
  }, [activeCompanyId]);

  function handleChange(companyId: string) {
    const membership = memberships.find((item) => item.companyId === companyId);

    if (!membership || companyId === selectedCompanyId) {
      return;
    }

    setSelectedCompanyId(companyId);
    setMessage(null);

    startTransition(async () => {
      const result = await selectActiveCompanyAction(companyId);

      if (!result.ok) {
        setSelectedCompanyId(activeCompanyId);
        setMessage(result.message);
        return;
      }

      const nextPath = getPathAfterCompanyChange(pathname, membership.role);

      if (nextPath === pathname) {
        router.refresh();
        return;
      }

      router.push(nextPath);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <label
        className="text-xs font-medium uppercase text-[var(--muted-foreground)]"
        htmlFor="company-switcher"
      >
        Empresa ativa
      </label>
      <div className="relative">
        <Building2
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
        <select
          className="h-11 w-full appearance-none rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-9 pr-10 text-sm text-white outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isPending || memberships.length < 2}
          id="company-switcher"
          onChange={(event) => handleChange(event.target.value)}
          value={selectedCompanyId}
        >
          {memberships.map((membership) => (
            <option key={membership.id} value={membership.companyId}>
              {membership.company.name} -{" "}
              {roleLabels[membership.role] ?? membership.role}
            </option>
          ))}
        </select>
        {isPending ? (
          <Loader2
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]"
          />
        ) : (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
            v
          </span>
        )}
      </div>
      {message ? (
        <p className="text-xs leading-5 text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
