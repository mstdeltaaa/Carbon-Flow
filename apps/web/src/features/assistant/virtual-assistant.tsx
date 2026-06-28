"use client";

import {
  Boxes,
  FileText,
  HelpCircle,
  PackageCheck,
  Send,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type Message = {
  author: "assistant" | "user";
  text: string;
};

type QuickPrompt = {
  icon: typeof Boxes;
  label: string;
  prompt: string;
};

type VirtualAssistantProps = {
  activeItem: string;
};

const pageTips: Record<string, string> = {
  account:
    "Aqui você ajusta dados da sua conta e pode trocar informações pessoais do usuário logado.",
  billing:
    "Em Planos você acompanha os limites da empresa e prepara a assinatura para recursos futuros.",
  budgets:
    "Em Orçamentos você cria propostas profissionais e pode converter um orçamento aprovado em venda.",
  customers:
    "Em Clientes você guarda contatos, observações e histórico comercial de cada pessoa ou empresa.",
  dashboard:
    "No Dashboard você acompanha faturamento, vendas, lucro estimado, produtos vendidos e alertas.",
  history:
    "No Histórico ficam registradas ações importantes, ajudando na auditoria e segurança da empresa.",
  ingredients:
    "Em Insumos você cadastra matérias-primas, custo unitário, estoque atual e estoque mínimo.",
  products:
    "Em Produtos você monta composições com insumos, calcula custo e define preço de venda.",
  sales:
    "Em Vendas você registra pedidos aprovados, acompanha valores e baixa estoque automaticamente.",
  settings:
    "Em Configurações você gerencia empresa, usuários, permissões e convites.",
  stock:
    "Em Estoque você acompanha entradas, saídas, ajustes e movimentações geradas pelas vendas."
};

const quickPrompts: QuickPrompt[] = [
  {
    icon: Boxes,
    label: "Criar insumo",
    prompt: "Como cadastro um insumo?"
  },
  {
    icon: PackageCheck,
    label: "Criar produto",
    prompt: "Como monto um produto com insumos?"
  },
  {
    icon: FileText,
    label: "Orçamento",
    prompt: "Como transformo orçamento em venda?"
  },
  {
    icon: HelpCircle,
    label: "Primeiros passos",
    prompt: "Por onde eu começo?"
  }
];

const navigationLinks = [
  { href: "/ingredients#app-content", label: "Insumos" },
  { href: "/products#app-content", label: "Produtos" },
  { href: "/budgets#app-content", label: "Orçamentos" },
  { href: "/sales#app-content", label: "Vendas" }
];

const fallbackAssistantAvatar =
  "/brand/AvatarBrancoePreto/Design sem nome (4).png";

const assistantAvatarByTheme: Record<string, string> = {
  "blue-dark": "/brand/AvatarAzulePreto/Design sem nome (1).png",
  "blue-light": "/brand/AvatarAzuleBranco/Design sem nome (5).png",
  "carbon-dark": fallbackAssistantAvatar,
  "carbon-light": "/brand/AvatarPretoeBranco/Design sem nome (2).png",
  "green-dark": "/brand/AvatarVerdeePreto/Design sem nome.png",
  "green-light": "/brand/AvatarVerdeeBranco/Design sem nome (3).png"
};

function getCurrentTheme() {
  if (typeof document === "undefined") {
    return "carbon-dark";
  }

  return document.documentElement.dataset.theme ?? "carbon-dark";
}

function AssistantAvatar({
  className,
  src
}: {
  className: string;
  src: string;
}) {
  return (
    <span
      className={["relative block", className].join(" ")}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="object-contain"
        fill
        sizes="56px"
        src={src}
      />
    </span>
  );
}

function getAssistantReply(prompt: string) {
  const normalized = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  if (normalized.includes("comeco") || normalized.includes("primeiro")) {
    return "Comece cadastrando os insumos, depois monte os produtos, cadastre clientes e então crie orçamentos. Quando um orçamento for aprovado, converta em venda para baixar estoque automaticamente.";
  }

  if (normalized.includes("insumo") || normalized.includes("materia")) {
    return "Para cadastrar um insumo, vá em Insumos, clique em Novo insumo e informe nome, unidade, custo unitário, estoque atual e estoque mínimo. Esse custo será usado no cálculo dos produtos.";
  }

  if (normalized.includes("produto") || normalized.includes("composicao")) {
    return "Para criar um produto, vá em Produtos, clique em Novo produto e adicione os insumos da composição. O Carbon Flow calcula o custo e sugere o preço com base na margem.";
  }

  if (normalized.includes("estoque") || normalized.includes("baixa")) {
    return "O estoque baixa automaticamente quando uma venda é criada a partir de produtos com composição. Também dá para acompanhar entradas, saídas e ajustes na tela Estoque.";
  }

  if (normalized.includes("orcamento") || normalized.includes("proposta")) {
    return "Em Orçamentos você seleciona cliente, produtos, quantidades, validade e observações. Depois pode imprimir ou abrir o documento profissional do orçamento.";
  }

  if (normalized.includes("venda") || normalized.includes("converter")) {
    return "Quando o cliente aprovar, use Converter em venda no orçamento. O sistema cria a venda, registra os itens e baixa os insumos do estoque.";
  }

  if (normalized.includes("cliente")) {
    return "Em Clientes você cadastra nome, telefone, e-mail, endereço e observações. O histórico ajuda a acompanhar orçamentos, vendas e valores gastos.";
  }

  if (
    normalized.includes("usuario") ||
    normalized.includes("convite") ||
    normalized.includes("permiss")
  ) {
    return "Em Configurações você gerencia usuários, convites e permissões. Administradores têm acesso total; vendedores e funcionários podem ter acesso limitado.";
  }

  if (normalized.includes("plano") || normalized.includes("assinatura")) {
    return "Em Planos você acompanha os limites do plano atual e deixa a estrutura pronta para assinaturas futuras.";
  }

  if (normalized.includes("tema") || normalized.includes("cor")) {
    return "Você pode trocar a aparência pelo seletor de tema. A escolha fica salva no navegador para os próximos acessos.";
  }

  return "Posso ajudar com insumos, produtos, estoque, clientes, orçamentos, vendas, usuários e planos. Me diga o que você quer fazer que eu te oriento pelo fluxo.";
}

export function VirtualAssistant({ activeItem }: VirtualAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState("carbon-dark");
  const introMessage = useMemo<Message>(
    () => ({
      author: "assistant",
      text:
        pageTips[activeItem] ??
        "Estou aqui para ajudar você a navegar pelo Carbon Flow."
    }),
    [activeItem]
  );
  const [messages, setMessages] = useState<Message[]>([introMessage]);
  const avatarSrc = assistantAvatarByTheme[theme] ?? fallbackAssistantAvatar;

  useEffect(() => {
    function syncTheme() {
      setTheme(getCurrentTheme());
    }

    syncTheme();

    window.addEventListener("carbon-flow-theme-change", syncTheme);
    window.addEventListener("storage", syncTheme);

    return () => {
      window.removeEventListener("carbon-flow-theme-change", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  function sendPrompt(prompt: string) {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      return;
    }

    setMessages((current) => [
      ...current,
      { author: "user", text: cleanPrompt },
      { author: "assistant", text: getAssistantReply(cleanPrompt) }
    ]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendPrompt(input);
  }

  return (
    <div className="fixed bottom-5 right-4 z-40 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <section className="mb-3 w-[min(calc(100vw-2rem),24rem)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] shadow-2xl shadow-[color:var(--shadow-color)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <AssistantAvatar
                className="h-12 w-12 shrink-0"
                src={avatarSrc}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  Assistente Carbon
                </p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  Ajuda rápida do sistema
                </p>
              </div>
            </div>

            <button
              aria-label="Fechar assistente"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="max-h-[22rem] space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                className={[
                  "rounded-md px-3 py-2 text-sm leading-6",
                  message.author === "assistant"
                    ? "mr-8 bg-[var(--surface-soft)] text-[var(--muted-foreground)]"
                    : "ml-8 bg-[var(--primary-active)] text-[var(--foreground)]"
                ].join(" ")}
                key={`${message.author}-${index}`}
              >
                {message.text}
              </div>
            ))}
          </div>

          <div className="border-t border-[var(--border)] p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {quickPrompts.map((item) => (
                <button
                  className="flex min-h-10 min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-left text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                  key={item.label}
                  onClick={() => sendPrompt(item.prompt)}
                  type="button"
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {navigationLinks.map((item) => (
                <Link
                  className="rounded-md bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--primary)] transition hover:bg-[var(--secondary)]"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Pergunte algo..."
                value={input}
              />
              <Button size="icon" type="submit">
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </section>
      ) : null}

      <button
        aria-label="Abrir assistente virtual"
        className="ml-auto flex h-60 w-60 items-center justify-center rounded-full bg-transparent transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        onClick={() => {
          setMessages((current) => (current.length ? current : [introMessage]));
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <AssistantAvatar className="h-[13.5rem] w-[13.5rem]" src={avatarSrc} />
      </button>
    </div>
  );
}
