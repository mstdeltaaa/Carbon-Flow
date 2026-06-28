import { redirect } from "next/navigation";
import Link from "next/link";

import { getActiveCompanyContext } from "@/lib/current-company";

import { CompanyForm } from "./company-form";

type OnboardingPageProps = {
  searchParams: Promise<{
    mode?: string;
  }>;
};

export default async function OnboardingPage({
  searchParams
}: OnboardingPageProps) {
  const [context, params] = await Promise.all([
    getActiveCompanyContext(),
    searchParams
  ]);

  if (!context?.user) {
    redirect("/login");
  }

  const isCreatingNewCompany = params.mode === "create";

  if (context.company && !isCreatingNewCompany) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="grid w-full max-w-4xl gap-6 lg:grid-cols-[0.9fr_1fr] lg:items-center">
        <div>
          <p className="text-sm text-[var(--primary)]">
            {isCreatingNewCompany ? "Nova empresa" : "Primeiro acesso"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            {isCreatingNewCompany
              ? "Crie outra empresa para este mesmo login."
              : "Crie a empresa que vai organizar seu fluxo."}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
            O usuário atual será vinculado como administrador da empresa criada
            e a assinatura inicial sera criada no plano Free.
          </p>
          {isCreatingNewCompany ? (
            <Link
              className="mt-5 inline-flex text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
              href="/"
            >
              Voltar para o sistema
            </Link>
          ) : null}
        </div>

        <CompanyForm />
      </section>
    </main>
  );
}
