"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const consentStorageKey = "carbon-flow-cookie-consent-v1";

type ConsentChoice = "accepted" | "essential";

function saveConsent(choice: ConsentChoice) {
  window.localStorage.setItem(
    consentStorageKey,
    JSON.stringify({
      choice,
      acceptedAt: new Date().toISOString(),
      version: 1
    })
  );
}

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(!window.localStorage.getItem(consentStorageKey));
  }, []);

  function handleConsent(choice: ConsentChoice) {
    saveConsent(choice);
    setIsVisible(false);
  }

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6">
      <section
        aria-label="Aviso de cookies e privacidade"
        className="mx-auto flex max-w-5xl flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] p-4 shadow-2xl shadow-[color:var(--shadow-color)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Cookies e privacidade
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            Usamos cookies essenciais para login, segurança e preferências do
            sistema. Ao continuar, você concorda com nossos{" "}
            <Link className="text-[var(--primary)] hover:underline" href="/terms">
              Termos de Uso
            </Link>{" "}
            e{" "}
            <Link className="text-[var(--primary)] hover:underline" href="/privacy">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => handleConsent("essential")}
            type="button"
            variant="secondary"
          >
            Apenas essenciais
          </Button>
          <Button onClick={() => handleConsent("accepted")} type="button">
            Aceitar
          </Button>
        </div>
      </section>
    </div>
  );
}
