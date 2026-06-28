"use client";

import { Loader2, LogIn, Mail, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "recover";

function getAuthMessage(message: string, mode: Mode) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return mode === "login"
      ? "E-mail ou senha incorretos. Se ainda não criou sua conta, use a aba Cadastrar."
      : "Não foi possível criar a conta com esses dados.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar ou desative a confirmação de e-mail no Supabase durante o desenvolvimento.";
  }

  if (normalized.includes("rate limit")) {
    return "O limite de e-mails foi atingido. Aguarde um pouco antes de tentar novamente.";
  }

  if (
    normalized.includes("already registered") ||
    normalized.includes("user already")
  ) {
    return "Este e-mail já tem conta. Entre com ele e use Nova empresa para criar outra empresa como administrador.";
  }

  return message;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("fullName") ?? "").trim();

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/set-password?type=recovery`
        });

        if (error) {
          setMessage(getAuthMessage(error.message, mode));
          return;
        }

        setMessage("Enviamos um link para redefinir sua senha.");
        return;
      }

      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                data: {
                  full_name: fullName
                }
              }
            });

      if (result.error) {
        setMessage(getAuthMessage(result.error.message, mode));
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Cadastro criado. Confirme seu e-mail antes de entrar.");
        return;
      }

      const next = searchParams.get("next") ?? "/";
      router.replace(next);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a autenticação."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      className="grid w-full max-w-md gap-4 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.86)] p-5"
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-2 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.52)] p-1">
        <button
          className={[
            "h-9 rounded-md text-sm transition",
            mode === "login"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "text-[var(--muted-foreground)] hover:text-white"
          ].join(" ")}
          onClick={() => {
            setMode("login");
            setMessage(null);
          }}
          type="button"
        >
          Entrar
        </button>
        <button
          className={[
            "h-9 rounded-md text-sm transition",
            mode === "signup"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "text-[var(--muted-foreground)] hover:text-white"
          ].join(" ")}
          onClick={() => {
            setMode("signup");
            setMessage(null);
          }}
          type="button"
        >
          Cadastrar
        </button>
      </div>

      {mode === "recover" ? (
        <div>
          <h2 className="text-xl font-semibold text-white">
            Recuperar senha
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Informe seu e-mail para receber o link de redefinição.
          </p>
        </div>
      ) : null}

      {mode === "signup" ? (
        <label className="grid gap-2 text-sm text-white">
          Nome
          <input
            className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
            name="fullName"
            placeholder="Seu nome"
            type="text"
          />
        </label>
      ) : null}

      <label className="grid gap-2 text-sm text-white">
        E-mail
        <input
          autoComplete="email"
          className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          name="email"
          placeholder="você@empresa.com"
          required
          type="email"
        />
      </label>

      {mode !== "recover" ? (
        <label className="grid gap-2 text-sm text-white">
          Senha
          <input
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
            minLength={6}
            name="password"
            placeholder="Mínimo 6 caracteres"
            required
            type="password"
          />
        </label>
      ) : null}

      {message ? (
        <p className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] p-3 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      <Button disabled={isLoading} type="submit">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : mode === "login" ? (
          <LogIn className="h-4 w-4" aria-hidden="true" />
        ) : mode === "recover" ? (
          <Mail className="h-4 w-4" aria-hidden="true" />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        )}
        {mode === "login"
          ? "Entrar"
          : mode === "recover"
            ? "Enviar link"
            : "Criar conta"}
      </Button>

      {mode === "login" ? (
        <button
          className="text-sm text-[var(--muted-foreground)] transition hover:text-white"
          onClick={() => {
            setMode("recover");
            setMessage(null);
          }}
          type="button"
        >
          Esqueci minha senha
        </button>
      ) : mode === "recover" ? (
        <button
          className="text-sm text-[var(--muted-foreground)] transition hover:text-white"
          onClick={() => {
            setMode("login");
            setMessage(null);
          }}
          type="button"
        >
          Voltar para entrar
        </button>
      ) : null}
    </form>
  );
}
