import { ShieldAlert } from "lucide-react";

type AccessDeniedProps = {
  description?: string;
  title?: string;
};

export function AccessDenied({
  description = "Seu perfil não permite acessar esta área.",
  title = "Acesso restrito"
}: AccessDeniedProps) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[rgb(16_19_20/0.78)] p-8 text-center">
      <ShieldAlert
        className="mx-auto h-8 w-8 text-[var(--primary)]"
        aria-hidden="true"
      />
      <h1 className="mt-4 text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        {description}
      </p>
    </section>
  );
}
