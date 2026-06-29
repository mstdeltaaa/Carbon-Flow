"use client";

import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { selectActiveCompanyAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CompanyForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const companyName = String(formData.get("companyName") ?? "");
    const companyDocument = String(formData.get("companyDocument") ?? "");
    const companySlug = slugify(companyName);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: companyId, error } = await supabase.rpc(
        "create_company_for_current_user",
        {
          company_document: companyDocument || null,
          company_name: companyName,
          company_slug: companySlug
        }
      );

      if (error) {
        setMessage(error.message);
        return;
      }

      if (typeof companyId === "string") {
        const selection = await selectActiveCompanyAction(companyId);

        if (!selection.ok) {
          setMessage(selection.message);
          return;
        }
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a empresa."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      className="grid w-full max-w-lg gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.86)] p-5"
      onSubmit={handleSubmit}
    >
      <label className="grid gap-2 text-sm text-white">
        Nome da empresa
        <input
          className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          name="companyName"
          placeholder="Ex: Atelie da Ana"
          required
          type="text"
        />
      </label>

      <label className="grid gap-2 text-sm text-white">
        Documento
        <input
          className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          name="companyDocument"
          placeholder="CNPJ ou CPF"
          type="text"
        />
      </label>

      <div className="rounded-md border border-[rgb(159_243_196/0.28)] bg-[rgb(159_243_196/0.08)] p-4 text-sm">
        <p className="font-medium text-white">7 dias grátis do Pro</p>
        <p className="mt-1 leading-6 text-[var(--muted-foreground)]">
          A empresa começa com limites maiores para testar o Carbon Flow. Ao fim
          do teste, o plano Free entra automaticamente.
        </p>
      </div>

      {message ? (
        <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      <Button disabled={isLoading} type="submit">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Building2 className="h-4 w-4" aria-hidden="true" />
        )}
        Criar empresa
      </Button>
    </form>
  );
}
