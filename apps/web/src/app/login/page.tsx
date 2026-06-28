import Image from "next/image";
import { Suspense } from "react";

import { ThemeSelector } from "@/features/theme/theme-selector";
import { hasSupabaseEnv } from "@/lib/env";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="grid w-full max-w-5xl gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-transparent">
              <Image
                alt=""
                aria-hidden="true"
                className="brand-logo-dark h-10 w-10 object-contain"
                height={40}
                priority
                src="/brand/carbon-flow-logo-on-dark-v2.png"
                width={40}
              />
              <Image
                alt=""
                aria-hidden="true"
                className="brand-logo-light h-10 w-10 object-contain"
                height={40}
                priority
                src="/brand/carbon-flow-logo-on-light-v2.png"
                width={40}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Carbon Flow</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Do insumo à venda
              </p>
            </div>
          </div>

          <h1 className="mt-8 text-3xl font-semibold text-white sm:text-4xl">
            Controle produção, custos, estoque e vendas em um único fluxo.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">
            Entre para acessar o painel da sua empresa ou crie a primeira conta
            administradora do ambiente.
          </p>

          <div className="max-w-md">
            <ThemeSelector />
          </div>

          {!hasSupabaseEnv ? (
            <div className="mt-6 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 text-sm text-[var(--muted-foreground)]">
              Configure `NEXT_PUBLIC_SUPABASE_URL` e
              `NEXT_PUBLIC_SUPABASE_ANON_KEY` para ativar login e cadastro.
            </div>
          ) : null}
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
