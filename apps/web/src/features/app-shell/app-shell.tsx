"use client";

import {
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  History,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  Settings,
  ShoppingCart,
  UserRound,
  UsersRound,
  WalletCards,
  Warehouse,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { VirtualAssistant } from "@/features/assistant/virtual-assistant";
import { CompanySwitcher } from "@/features/company/company-switcher";
import { ThemeSelector } from "@/features/theme/theme-selector";

import {
  canAccessSection,
  type AppSection,
  type CompanyPermissionMap,
} from "@/lib/access-control";
import type { CompanyMembership } from "@/lib/current-company";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: BarChart3, id: "dashboard" },
  { label: "Insumos", href: "/ingredients", icon: Boxes, id: "ingredients" },
  { label: "Produtos", href: "/products", icon: PackageCheck, id: "products" },
  { label: "Estoque", href: "/stock", icon: Warehouse, id: "stock" },
  { label: "Clientes", href: "/customers", icon: UsersRound, id: "customers" },
  { label: "Orçamentos", href: "/budgets", icon: FileText, id: "budgets" },
  { label: "Vendas", href: "/sales", icon: ShoppingCart, id: "sales" },
  { label: "Financeiro", href: "/finance", icon: WalletCards, id: "finance" },
  { label: "Histórico", href: "/history", icon: History, id: "history" },
  { label: "Planos", href: "/billing", icon: CreditCard, id: "billing" },
  { label: "Minha conta", href: "/account", icon: UserRound, id: "account" },
  { label: "Configurações", href: "/settings", icon: Settings, id: "settings" },
];

const contentAnchor = "app-content";

function CarbonBrand() {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="-ml-1 -mt-1 flex h-12 w-12 shrink-0 items-start justify-start bg-transparent pt-1">
        <Image
          alt=""
          aria-hidden="true"
          className="brand-logo-dark h-8 w-8 object-contain object-left-top"
          height={40}
          src="/brand/carbon-flow-logo-on-dark-v2.png"
          width={40}
        />
        <Image
          alt=""
          aria-hidden="true"
          className="brand-logo-light h-8 w-8 object-contain object-left-top"
          height={40}
          src="/brand/carbon-flow-logo-on-light-v2.png"
          width={40}
        />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm font-semibold text-white">Carbon Flow</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Fluxo de produção
        </p>
      </div>
    </div>
  );
}

function CompanyLogoBadge({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl: string | null;
}) {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-[var(--border)] bg-[rgb(8_10_11/0.52)] p-1 text-center"
      title="Logo da empresa nos documentos"
    >
      {logoUrl ? (
        <img
          alt={`Logo de ${companyName}`}
          className="h-full w-full object-contain"
          src={logoUrl}
        />
      ) : (
        <span className="text-[9px] font-medium leading-3 text-[var(--muted-foreground)]">
          Sua logo
        </span>
      )}
    </div>
  );
}

type AppShellProps = {
  activeItem: string;
  activeCompanyId: string;
  children: ReactNode;
  companyName: string;
  memberships: CompanyMembership[];
  permissions: CompanyPermissionMap | null;
  role: string | null;
  userEmail: string;
};

export function AppShell({
  activeItem,
  activeCompanyId,
  children,
  companyName,
  memberships,
  permissions,
  role,
  userEmail,
}: AppShellProps) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) =>
        canAccessSection(role, item.id as AppSection, permissions),
      ),
    [permissions, role],
  );
  const prefetchRoutes = useMemo(
    () => [
      ...new Set([
        ...visibleNavItems.map((item) => item.href),
        "/onboarding?mode=create",
      ]),
    ],
    [visibleNavItems],
  );
  const activeCompanyLogoUrl =
    memberships.find((membership) => membership.companyId === activeCompanyId)
      ?.company.logoUrl ?? null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      prefetchRoutes.forEach((href) => router.prefetch(href));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [prefetchRoutes, router]);

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 px-3 pt-3 lg:hidden">
        <div className="carbon-mobile-glass relative flex h-16 items-center justify-between rounded-lg border border-[var(--border)] px-3 shadow-xl shadow-[color:var(--shadow-color)]">
          <CompanyLogoBadge
            companyName={companyName}
            logoUrl={activeCompanyLogoUrl}
          />
          <p className="absolute left-1/2 max-w-[12rem] -translate-x-1/2 truncate text-sm font-semibold text-[var(--foreground)]">
            Carbon Flow
          </p>
          <button
            aria-expanded={isMobileMenuOpen}
            aria-label="Abrir menu"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)] transition hover:bg-[var(--secondary)]"
            onClick={() => setIsMobileMenuOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside className="carbon-mobile-glass absolute bottom-3 left-3 right-3 top-3 flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] shadow-2xl shadow-[color:var(--shadow-color)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
              <CarbonBrand />
              <button
                aria-label="Fechar menu"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)] transition hover:bg-[var(--secondary)]"
                onClick={() => setIsMobileMenuOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
                  <Link
                    href="/onboarding?mode=create"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nova empresa
                  </Link>
                </Button>
              </div>

              <nav className="mt-4 grid gap-2">
                {visibleNavItems.map((item) => {
                  const isActive = activeItem === item.id;

                  return (
                    <Link
                      className={[
                        "flex h-11 min-w-0 items-center gap-3 rounded-md px-3 text-left text-sm transition",
                        isActive
                          ? "bg-[rgb(159_243_196/0.14)] text-[var(--primary)]"
                          : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-white",
                      ].join(" ")}
                      href={`${item.href}#${contentAnchor}`}
                      key={item.id}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
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
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex w-full max-w-none flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-5 sm:py-4 lg:flex-row lg:px-6 xl:px-8 2xl:px-10">
        <aside className="hidden min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.86)] p-3 shadow-2xl shadow-[color:var(--shadow-color)] lg:sticky lg:top-4 lg:block lg:h-[calc(100vh-2rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto">
          <div className="flex min-w-0 items-start gap-3 px-2 py-3">
            <div className="min-w-0 flex-1">
              <CarbonBrand />
            </div>
            <CompanyLogoBadge
              companyName={companyName}
              logoUrl={activeCompanyLogoUrl}
            />
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

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-5 lg:grid lg:overflow-visible lg:pb-0">
            {visibleNavItems.map((item) => {
              const isActive = activeItem === item.id;

              return (
                <Link
                  className={[
                    "flex h-10 min-w-fit shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 text-left text-sm transition lg:min-w-0 lg:shrink",
                    isActive
                      ? "bg-[rgb(159_243_196/0.14)] text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-white",
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
          className="flex min-w-0 scroll-mt-4 flex-1 flex-col gap-4 pb-24 sm:gap-5 lg:pb-8"
          id={contentAnchor}
        >
          {children}
        </section>
      </div>
      <VirtualAssistant
        activeItem={activeItem}
        companyId={activeCompanyId}
        permissions={permissions}
        role={role}
        userEmail={userEmail}
      />
    </main>
  );
}
