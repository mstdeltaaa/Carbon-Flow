import Link from "next/link";

const termsItems = [
  {
    title: "Uso da plataforma",
    text: "O Carbon Flow deve ser usado para gestão de produção, custos, estoque, clientes, orçamentos e vendas de empresas autorizadas pelo titular da conta."
  },
  {
    title: "Responsabilidade pelos dados",
    text: "A empresa usuária é responsável pela veracidade dos dados cadastrados, incluindo preços, custos, estoque, clientes, produtos e informações comerciais."
  },
  {
    title: "Acesso e segurança",
    text: "Cada usuário deve manter suas credenciais protegidas. Ações feitas com uma conta autenticada podem ser registradas para auditoria e segurança."
  },
  {
    title: "Disponibilidade",
    text: "Trabalhamos para manter o sistema disponível, mas integrações, provedores externos, manutenção e eventos técnicos podem afetar temporariamente o acesso."
  },
  {
    title: "Planos e limites",
    text: "O sistema pode aplicar limites por plano, como quantidade de usuários, empresas, produtos, orçamentos, vendas ou recursos avançados."
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] p-6 shadow-2xl shadow-[color:var(--shadow-color)]">
        <Link
          className="text-sm text-[var(--primary)] hover:underline"
          href="/login"
        >
          Voltar para o Carbon Flow
        </Link>

        <p className="mt-8 text-sm text-[var(--muted-foreground)]">
          Última atualização: 28 de junho de 2026
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
          Termos de Uso
        </h1>
        <p className="mt-4 leading-7 text-[var(--muted-foreground)]">
          Estes termos definem regras básicas para uso do Carbon Flow. Este
          texto é uma base inicial e deve ser revisado juridicamente antes do
          lançamento comercial.
        </p>

        <div className="mt-8 grid gap-5">
          {termsItems.map((item) => (
            <article
              className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] p-4"
              key={item.title}
            >
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {item.text}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
