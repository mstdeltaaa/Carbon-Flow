import {
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  History,
  LogOut,
  PackageCheck,
  Plus,
  Settings,
  ShoppingCart,
  UserRound,
  UsersRound,
  Warehouse
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { VirtualAssistant } from "@/features/assistant/virtual-assistant";
import { CompanySwitcher } from "@/features/company/company-switcher";
import { ThemeSelector } from "@/features/theme/theme-selector";
import { canAccessSection, type AppSection } from "@/lib/access-control";
import type { CompanyMembership } from "@/lib/current-company";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: BarChart3, id: "dashboard" },
  { label: "Insumos", href: "/ingredients", icon: Boxes, id: "ingredients" },
  { label: "Produtos", href: "/products", icon: PackageCheck, id: "products" },
  { label: "Estoque", href: "/stock", icon: Warehouse, id: "stock" },
  { label: "Clientes", href: "/customers", icon: UsersRound, id: "customers" },
  { label: "Orçamentos", href: "/budgets", icon: FileText, id: "budgets" },
  { label: "Vendas", href: "/sales", icon: ShoppingCart, id: "sales" },
  { label: "Histórico", href: "/history", icon: History, id: "history" },
  { label: "Planos", href: "/billing", icon: CreditCard, id: "billing" },
  { label: "Minha conta", href: "/account", icon: UserRound, id: "account" },
  { label: "Configurações", href: "/settings", icon: Settings, id: "settings" }
];

const contentAnchor = "app-content";

type AppShellProps = {
  activeItem: string;
  activeCompanyId: string;
  children: ReactNode;
  companyName: string;
  memberships: CompanyMembership[];
  role: string | null;
  userEmail: string;
};

export function AppShell({
  activeItem,
  activeCompanyId,
  children,
  companyName,
  memberships,
  role,
  userEmail
}: AppShellProps) {
  const visibleNavItems = navItems.filter((item) =>
    canAccessSection(role, item.id as AppSection)
  );

  return (
    <main className="min-h-screen">
      <div className="flex w-full max-w-none flex-col gap-5 px-4 py-4 sm:px-6 lg:flex-row lg:px-8 2xl:px-10">
        <aside className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.86)] p-3 shadow-2xl shadow-[color:var(--shadow-color)] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-transparent">
              <Image
                alt=""
                aria-hidden="true"
                className="brand-logo-dark h-8 w-8 object-contain"
                height={40}
                src="/brand/carbon-flow-logo-on-dark-v2.png"
                width={40}
              />
              <Image
                alt=""
                aria-hidden="true"
                className="brand-logo-light h-8 w-8 object-contain"
                height={40}
                src="/brand/carbon-flow-logo-on-light-v2.png"
                width={40}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Carbon Flow</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Fluxo de produção
              </p>
            </div>
          </div>

          <ThemeSelector />

          <div className="mt-4 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.52)] p-3">
            <p className="truncate text-sm font-medium text-white">
              {companyName}
            </p>
            <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
              {userEmail}
            </p>
            <div className="mt-3">
              <CompanySwitcher
                activeCompanyId={activeCompanyId}
                memberships={memberships}
              />
            </div>
            <Button asChild className="mt-3 w-full" variant="secondary">
              <Link href="/onboarding?mode=create">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nova empresa
              </Link>
            </Button>
          </div>

          <nav className="mt-5 grid gap-1">
            {visibleNavItems.map((item) => {
              const isActive = activeItem === item.id;

              return (
                <Link
                  className={[
                    "flex h-10 min-w-0 items-center gap-3 rounded-md px-3 text-left text-sm transition",
                    isActive
                      ? "bg-[rgb(159_243_196/0.14)] text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-white"
                  ].join(" ")}
                  href={`${item.href}#${contentAnchor}`}
                  key={item.id}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <form action={signOutAction} className="mt-5">
            <Button className="w-full" type="submit" variant="secondary">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </Button>
          </form>
        </aside>

        <section
          className="flex min-w-0 scroll-mt-4 flex-1 flex-col gap-5"
          id={contentAnchor}
        >
          {children}
        </section>
      </div>
      <VirtualAssistant
        activeItem={activeItem}
        companyId={activeCompanyId}
        userEmail={userEmail}
      />
    </main>
  );
}
