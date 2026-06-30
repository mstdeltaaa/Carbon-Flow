"use client";

import { Loader2, LockKeyhole, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { selectActiveCompanyAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SetPasswordType = "invite" | "recovery";

function getAuthMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("weak password")) {
    return "Use uma senha mais forte.";
  }

  if (normalized.includes("expired") || normalized.includes("invalid")) {
    return "Este link expirou ou já foi usado. Solicite um novo link de acesso.";
  }

  return message;
}

export function SetPasswordForm() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState(false);
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<SetPasswordType>("invite");

  useEffect(() => {
    async function prepareSession() {
      try {
        const supabase = createSupabaseBrowserClient();
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, "")
        );
        const code = searchParams.get("code");
        const companyId = searchParams.get("company_id");
        const flowType =
          searchParams.get("type") === "recovery" ? "recovery" : "invite";
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        setInviteCompanyId(companyId);
        setType(flowType);

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            throw error;
          }
        }

        if (code || window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }

        const {
          data: { session }
        } = await supabase.auth.getSession();

        setHasSession(Boolean(session));

        if (!session) {
          setMessage(
            flowType === "recovery"
              ? "Abra esta tela pelo link de recuperação recebido por e-mail."
              : "Abra esta tela pelo link do convite recebido por e-mail para definir sua senha."
          );
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? getAuthMessage(error.message)
            : "Não foi possível validar o link."
        );
      } finally {
        setIsChecking(false);
      }
    }

    void prepareSession();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 6) {
      setMessage("A senha precisa ter pelo menos 6 caracteres.");
      setIsSaving(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("As senhas não conferem.");
      setIsSaving(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(getAuthMessage(error.message));
        return;
      }

      setMessage("Senha definida com sucesso. Redirecionando...");

      if (inviteCompanyId) {
        await selectActiveCompanyAction(inviteCompanyId);
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? getAuthMessage(error.message)
          : "Não foi possível salvar a senha."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.86)] p-4 sm:p-5"
      onSubmit={handleSubmit}
    >
      <div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-white">
          {type === "recovery" ? "Redefinir senha" : "Definir senha"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {type === "recovery"
            ? "Crie uma nova senha para voltar ao Carbon Flow."
            : "Crie sua senha para acessar a empresa no Carbon Flow."}
        </p>
      </div>

      <label className="grid gap-2 text-sm text-white">
        Nova senha
        <input
          autoComplete="new-password"
          className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          disabled={!hasSession || isChecking || isSaving}
          minLength={6}
          name="password"
          placeholder="Mínimo 6 caracteres"
          required
          type="password"
        />
      </label>

      <label className="grid gap-2 text-sm text-white">
        Confirmar senha
        <input
          autoComplete="new-password"
          className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          disabled={!hasSession || isChecking || isSaving}
          minLength={6}
          name="confirmPassword"
          placeholder="Repita a senha"
          required
          type="password"
        />
      </label>

      {message ? (
        <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      <Button disabled={!hasSession || isChecking || isSaving} type="submit">
        {isChecking || isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="h-4 w-4" aria-hidden="true" />
        )}
        Salvar senha
      </Button>
    </form>
  );
}
