"use client";

import { KeyRound, Loader2, LogOut, Save, UserRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccountManagerProps = {
  companyName: string;
  role: string | null;
};

type ProfileState = {
  email: string;
  fullName: string;
  userId: string;
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  employee: "Funcionário",
  seller: "Vendedor"
};

function getAuthMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("weak password")) {
    return "Use uma senha mais forte.";
  }

  if (normalized.includes("same password")) {
    return "Use uma senha diferente da atual.";
  }

  return message;
}

export function AccountManager({ companyName, role }: AccountManagerProps) {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [profile, setProfile] = useState<ProfileState>({
    email: "",
    fullName: "",
    userId: ""
  });

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();

      if (error) {
        throw error;
      }

      if (!user) {
        throw new Error("Sessão expirada. Entre novamente.");
      }

      const { data: publicUser } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      setProfile({
        email:
          String(publicUser?.email ?? user.email ?? "").trim() ||
          "E-mail indisponível",
        fullName:
          String(
            publicUser?.full_name ?? user.user_metadata?.full_name ?? ""
          ).trim(),
        userId: user.id
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar sua conta."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setMessage(null);

    const fullName = profile.fullName.trim();

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName
        }
      });

      if (authError) {
        throw authError;
      }

      const { error: profileError } = await supabase.from("users").upsert(
        {
          email: profile.email,
          full_name: fullName || null,
          id: profile.userId
        },
        {
          onConflict: "id"
        }
      );

      if (profileError) {
        throw profileError;
      }

      setProfile((current) => ({
        ...current,
        fullName
      }));
      setMessage("Perfil atualizado.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o perfil."
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingPassword(true);
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage("A senha precisa ter pelo menos 6 caracteres.");
      setIsSavingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("As senhas não conferem.");
      setIsSavingPassword(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      setNewPassword("");
      setConfirmPassword("");
      setMessage("Senha alterada com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? getAuthMessage(error.message)
          : "Não foi possível alterar a senha."
      );
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <>
      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[var(--primary)]">Conta</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Minha conta
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Gerencie seus dados de acesso e sua senha no Carbon Flow.
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:min-w-[26rem]">
            <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
              <p className="text-xs text-[var(--muted-foreground)]">
                Empresa ativa
              </p>
              <p className="mt-2 truncate text-xl font-semibold text-white">
                {companyName}
              </p>
            </article>
            <article className="rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.44)] p-4">
              <p className="text-xs text-[var(--muted-foreground)]">Perfil</p>
              <p className="mt-2 truncate text-xl font-semibold text-white">
                {role ? roleLabels[role] ?? role : "-"}
              </p>
            </article>
          </div>
        </div>
      </section>

      {message ? (
        <p className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-4 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}

      {isLoading ? (
        <section className="flex min-h-[18rem] items-center justify-center rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-8 text-[var(--muted-foreground)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Carregando conta
        </section>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <form
            className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6"
            onSubmit={handleProfileSubmit}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white">
                  Dados pessoais
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Nome exibido para sua equipe
                </p>
              </div>
              <UserRound
                className="h-5 w-5 shrink-0 text-[var(--primary)]"
                aria-hidden="true"
              />
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm text-white">
                Nome
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                  disabled={isSavingProfile}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      fullName: event.target.value
                    }))
                  }
                  placeholder="Seu nome"
                  type="text"
                  value={profile.fullName}
                />
              </label>

              <label className="grid gap-2 text-sm text-white">
                E-mail
                <input
                  className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.42)] px-3 text-[var(--muted-foreground)] outline-none"
                  disabled
                  type="email"
                  value={profile.email}
                />
              </label>
            </div>

            <Button className="mt-5" disabled={isSavingProfile} type="submit">
              {isSavingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Salvar perfil
            </Button>
          </form>

          <section className="grid gap-5">
            <form
              className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6"
              onSubmit={handlePasswordSubmit}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    Alterar senha
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Atualize sua senha de acesso
                  </p>
                </div>
                <KeyRound
                  className="h-5 w-5 shrink-0 text-[var(--primary)]"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm text-white">
                  Nova senha
                  <input
                    autoComplete="new-password"
                    className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                    disabled={isSavingPassword}
                    minLength={6}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>

                <label className="grid gap-2 text-sm text-white">
                  Confirmar senha
                  <input
                    autoComplete="new-password"
                    className="h-11 rounded-md border border-[var(--border)] bg-[rgb(8_10_11/0.72)] px-3 text-white outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                    disabled={isSavingPassword}
                    minLength={6}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Repita a senha"
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              </div>

              <Button
                className="mt-5 w-full"
                disabled={isSavingPassword}
                type="submit"
              >
                {isSavingPassword ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                Alterar senha
              </Button>
            </form>

            <form
              action={signOutAction}
              className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-5 sm:p-6"
            >
              <h2 className="text-base font-semibold text-white">Sair</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Encerre a sessao neste dispositivo.
              </p>
              <Button className="mt-5 w-full" type="submit" variant="secondary">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sair da conta
              </Button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
