import Link from "next/link";

const privacyItems = [
  {
    title: "Dados que coletamos",
    text: "Coletamos dados de conta, empresa, clientes cadastrados, produtos, insumos, orçamentos, vendas e registros de uso necessários para operar o Carbon Flow."
  },
  {
    title: "Como usamos os dados",
    text: "Usamos os dados para autenticação, controle multiempresa, geração de relatórios, segurança, suporte, melhoria do produto e cumprimento de obrigações legais."
  },
  {
    title: "Cookies",
    text: "Usamos cookies essenciais para manter a sessão de login, lembrar preferências como tema visual e proteger o acesso ao sistema."
  },
  {
    title: "Compartilhamento",
    text: "Não vendemos dados pessoais. Podemos usar provedores de infraestrutura, autenticação, banco de dados, hospedagem e e-mail para operar o serviço."
  },
  {
    title: "Direitos do usuário",
    text: "O usuário pode solicitar acesso, correção, portabilidade ou exclusão de dados, respeitando obrigações legais e registros necessários para segurança."
  }
];

export default function PrivacyPage() {
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
          Política de Privacidade
        </h1>
        <p className="mt-4 leading-7 text-[var(--muted-foreground)]">
          Esta política explica, de forma resumida, como o Carbon Flow trata
          dados pessoais e informações operacionais cadastradas na plataforma.
          Este texto é uma base inicial e deve ser revisado juridicamente antes
          do lançamento comercial.
        </p>

        <div className="mt-8 grid gap-5">
          {privacyItems.map((item) => (
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
