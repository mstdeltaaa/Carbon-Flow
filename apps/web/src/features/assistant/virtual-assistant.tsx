"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  HelpCircle,
  History,
  PackageCheck,
  Plus,
  Send,
  ShoppingCart,
  Settings,
  Trophy,
  UserRound,
  UsersRound,
  Warehouse,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  emitAssistantAction,
  storeAssistantAction,
  type AssistantActionId
} from "@/features/assistant/assistant-actions";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Message = {
  author: "assistant" | "user";
  text: string;
};

type QuickPrompt = {
  icon: typeof Boxes;
  label: string;
  prompt: string;
};

type QuickAction = {
  actionId?: AssistantActionId;
  href: string;
  icon: typeof Boxes;
  label: string;
  reply: string;
};

type VirtualAssistantProps = {
  activeItem: string;
  companyId: string;
};

type DashboardSummary = {
  period: {
    label: string;
    start: string;
    end: string;
  };
  metrics: {
    estimatedProfit: number;
    lowStockCount: number;
    openBudgetAmount: number;
    openBudgetCount: number;
    revenue: number;
    salesCount: number;
  };
  bestSellers: Array<{
    productId: string | null;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  lowStock: Array<{
    category: string | null;
    current: number;
    id: string;
    minimum: number;
    name: string;
    unit: string;
  }>;
  alerts: Array<{
    detail: string;
    severity: "info" | "warning";
    title: string;
    type: string;
  }>;
};

type ReplyContext = {
  dashboard: DashboardSummary | null;
  dashboardError: string | null;
  isDashboardLoading: boolean;
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

const quickPromptById = {
  bestSellers: {
    icon: Trophy,
    label: "Mais vendidos",
    prompt: "Quais produtos mais venderam?"
  },
  budgetToSale: {
    icon: FileText,
    label: "Converter venda",
    prompt: "Como transformo orçamento em venda?"
  },
  customerHistory: {
    icon: UsersRound,
    label: "Histórico cliente",
    prompt: "Como acompanho o histórico de um cliente?"
  },
  dashboardSummary: {
    icon: BarChart3,
    label: "Resumo do mês",
    prompt: "Resumo do mês"
  },
  firstSteps: {
    icon: HelpCircle,
    label: "Primeiros passos",
    prompt: "Por onde eu começo?"
  },
  ingredientCost: {
    icon: Boxes,
    label: "Custo insumo",
    prompt: "Como cadastro custo de insumo?"
  },
  lowStock: {
    icon: AlertTriangle,
    label: "Estoque baixo",
    prompt: "Tem estoque baixo?"
  },
  minimumStock: {
    icon: AlertTriangle,
    label: "Estoque mínimo",
    prompt: "Como defino estoque mínimo?"
  },
  permissions: {
    icon: Settings,
    label: "Permissões",
    prompt: "Como funcionam permissões de usuários?"
  },
  pricing: {
    icon: PackageCheck,
    label: "Preço sugerido",
    prompt: "Como calculo preço e margem?"
  },
  salesFlow: {
    icon: ShoppingCart,
    label: "Baixa estoque",
    prompt: "Como a venda baixa o estoque?"
  },
  subscription: {
    icon: CreditCard,
    label: "Planos",
    prompt: "Como funcionam os planos?"
  }
} satisfies Record<string, QuickPrompt>;

const defaultQuickPrompts: QuickPrompt[] = [
  quickPromptById.dashboardSummary,
  quickPromptById.lowStock,
  quickPromptById.bestSellers,
  quickPromptById.firstSteps
];

const quickPromptsByPage: Record<string, QuickPrompt[]> = {
  account: [
    quickPromptById.permissions,
    quickPromptById.subscription,
    quickPromptById.firstSteps
  ],
  billing: [
    quickPromptById.subscription,
    quickPromptById.permissions,
    quickPromptById.firstSteps
  ],
  budgets: [
    quickPromptById.budgetToSale,
    quickPromptById.pricing,
    quickPromptById.customerHistory
  ],
  customers: [
    quickPromptById.customerHistory,
    quickPromptById.budgetToSale,
    quickPromptById.firstSteps
  ],
  dashboard: [
    quickPromptById.dashboardSummary,
    quickPromptById.lowStock,
    quickPromptById.bestSellers
  ],
  history: [
    quickPromptById.salesFlow,
    quickPromptById.permissions,
    quickPromptById.firstSteps
  ],
  ingredients: [
    quickPromptById.ingredientCost,
    quickPromptById.minimumStock,
    quickPromptById.lowStock
  ],
  products: [
    quickPromptById.pricing,
    quickPromptById.ingredientCost,
    quickPromptById.budgetToSale
  ],
  sales: [
    quickPromptById.salesFlow,
    quickPromptById.dashboardSummary,
    quickPromptById.lowStock
  ],
  settings: [
    quickPromptById.permissions,
    quickPromptById.subscription,
    quickPromptById.firstSteps
  ],
  stock: [
    quickPromptById.lowStock,
    quickPromptById.minimumStock,
    quickPromptById.salesFlow
  ]
};

const quickActionById = {
  account: {
    href: "/account#app-content",
    icon: UserRound,
    label: "Minha conta",
    reply: "Vou abrir sua conta."
  },
  billing: {
    href: "/billing#app-content",
    icon: CreditCard,
    label: "Ver planos",
    reply: "Vou abrir a área de planos."
  },
  createBudget: {
    actionId: "create-budget",
    href: "/budgets#budget-form",
    icon: FileText,
    label: "Novo orçamento",
    reply: "Vou te levar para o formulário de orçamento."
  },
  createIngredient: {
    actionId: "create-ingredient",
    href: "/ingredients#ingredient-form",
    icon: Plus,
    label: "Cadastrar insumo",
    reply: "Vou te levar para o cadastro de insumos."
  },
  createProduct: {
    actionId: "create-product",
    href: "/products#product-form",
    icon: PackageCheck,
    label: "Criar produto",
    reply: "Vou abrir a criação de produto."
  },
  customers: {
    href: "/customers#app-content",
    icon: UsersRound,
    label: "Ver clientes",
    reply: "Vou abrir a área de clientes."
  },
  dashboard: {
    href: "/dashboard#app-content",
    icon: BarChart3,
    label: "Dashboard",
    reply: "Vou abrir o dashboard."
  },
  history: {
    href: "/history#app-content",
    icon: History,
    label: "Histórico",
    reply: "Vou abrir o histórico."
  },
  openStockList: {
    actionId: "open-stock-list",
    href: "/stock#stock-list",
    icon: Warehouse,
    label: "Ver estoque",
    reply: "Vou abrir a visão de estoque."
  },
  openStockMovement: {
    actionId: "open-stock-movement",
    href: "/stock#stock-movement-form",
    icon: ShoppingCart,
    label: "Lançar estoque",
    reply: "Vou abrir o lançamento de movimentação."
  },
  sales: {
    href: "/sales#app-content",
    icon: ShoppingCart,
    label: "Ver vendas",
    reply: "Vou abrir a tela de vendas."
  },
  settings: {
    href: "/settings#app-content",
    icon: Settings,
    label: "Configurações",
    reply: "Vou abrir as configurações."
  }
} satisfies Record<string, QuickAction>;

const defaultQuickActions: QuickAction[] = [
  quickActionById.createIngredient,
  quickActionById.createProduct,
  quickActionById.createBudget
];

const quickActionsByPage: Record<string, QuickAction[]> = {
  account: [
    quickActionById.settings,
    quickActionById.billing,
    quickActionById.dashboard
  ],
  billing: [
    quickActionById.settings,
    quickActionById.dashboard,
    quickActionById.account
  ],
  budgets: [
    quickActionById.createBudget,
    quickActionById.customers,
    quickActionById.sales
  ],
  customers: [
    quickActionById.createBudget,
    quickActionById.sales,
    quickActionById.dashboard
  ],
  dashboard: [
    quickActionById.createBudget,
    quickActionById.openStockList,
    quickActionById.sales
  ],
  history: [
    quickActionById.sales,
    quickActionById.openStockList,
    quickActionById.settings
  ],
  ingredients: [
    quickActionById.createIngredient,
    quickActionById.openStockMovement,
    quickActionById.openStockList
  ],
  products: [
    quickActionById.createProduct,
    quickActionById.createIngredient,
    quickActionById.createBudget
  ],
  sales: [
    quickActionById.createBudget,
    quickActionById.openStockList,
    quickActionById.dashboard
  ],
  settings: [
    quickActionById.billing,
    quickActionById.account,
    quickActionById.dashboard
  ],
  stock: [
    quickActionById.openStockMovement,
    quickActionById.openStockList,
    quickActionById.createIngredient
  ]
};

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
  sizes = "56px",
  src
}: {
  className: string;
  sizes?: string;
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
        quality={95}
        sizes={sizes}
        src={src}
      />
    </span>
  );
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4
});

function normalizePrompt(prompt: string) {
  return prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getApiMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    Array.isArray(payload.message)
  ) {
    return payload.message.join(" ");
  }

  return fallback;
}

function formatQuantity(value: number, unit?: string) {
  return [decimalFormatter.format(value), unit].filter(Boolean).join(" ");
}

function getRealDataUnavailableReply({
  dashboard,
  dashboardError,
  isDashboardLoading
}: ReplyContext) {
  if (dashboard) {
    return null;
  }

  if (isDashboardLoading) {
    return "Estou carregando os dados reais da empresa. Tente perguntar de novo em alguns segundos.";
  }

  if (dashboardError) {
    return `Ainda não consegui carregar os dados reais da empresa. Motivo: ${dashboardError}`;
  }

  return "Ainda não tenho os dados reais carregados nesta sessão. Tente novamente em alguns segundos.";
}

function formatDashboardReply(context: ReplyContext) {
  const unavailableReply = getRealDataUnavailableReply(context);

  if (unavailableReply) {
    return unavailableReply;
  }

  const dashboard = context.dashboard!;
  const metrics = dashboard.metrics;
  const bestSeller = dashboard.bestSellers[0];
  const stockDetail =
    metrics.lowStockCount > 0
      ? `${metrics.lowStockCount} insumo(s) em estoque baixo`
      : "nenhum insumo em estoque baixo";
  const bestSellerDetail = bestSeller
    ? `O produto mais vendido é ${bestSeller.productName}, com ${formatQuantity(
        bestSeller.quantity
      )} vendido(s).`
    : "Ainda não há produto mais vendido neste mês.";

  return `Resumo do mês atual: faturamento de ${currencyFormatter.format(
    metrics.revenue
  )}, ${metrics.salesCount} venda(s), lucro estimado de ${currencyFormatter.format(
    metrics.estimatedProfit
  )} e ${metrics.openBudgetCount} orçamento(s) em aberto somando ${currencyFormatter.format(
    metrics.openBudgetAmount
  )}. No estoque, há ${stockDetail}. ${bestSellerDetail}`;
}

function formatFinancialReply(context: ReplyContext) {
  const unavailableReply = getRealDataUnavailableReply(context);

  if (unavailableReply) {
    return unavailableReply;
  }

  const metrics = context.dashboard!.metrics;
  const margin =
    metrics.revenue > 0
      ? ` A margem estimada está em ${decimalFormatter.format(
          Math.round((metrics.estimatedProfit / metrics.revenue) * 1000) / 10
        )}%.`
      : " Ainda não há margem porque não existem vendas no período.";

  return `No mês atual, o faturamento está em ${currencyFormatter.format(
    metrics.revenue
  )}, com ${metrics.salesCount} venda(s) e lucro estimado de ${currencyFormatter.format(
    metrics.estimatedProfit
  )}.${margin}`;
}

function formatLowStockReply(context: ReplyContext) {
  const unavailableReply = getRealDataUnavailableReply(context);

  if (unavailableReply) {
    return unavailableReply;
  }

  const dashboard = context.dashboard!;

  if (dashboard.metrics.lowStockCount === 0) {
    return "Agora não há nenhum insumo abaixo do estoque mínimo. O estoque está saudável nesse ponto.";
  }

  const items = dashboard.lowStock
    .map(
      (item) =>
        `${item.name}: atual ${formatQuantity(
          item.current,
          item.unit
        )}, mínimo ${formatQuantity(item.minimum, item.unit)}`
    )
    .join("; ");

  return `Há ${dashboard.metrics.lowStockCount} insumo(s) em estoque baixo. Principais pontos: ${items}.`;
}

function formatBestSellersReply(context: ReplyContext) {
  const unavailableReply = getRealDataUnavailableReply(context);

  if (unavailableReply) {
    return unavailableReply;
  }

  const bestSellers = context.dashboard!.bestSellers;

  if (bestSellers.length === 0) {
    return "Ainda não há produtos vendidos no mês atual. Assim que vendas forem registradas, eu mostro o ranking aqui.";
  }

  const ranking = bestSellers
    .map(
      (product, index) =>
        `${index + 1}. ${product.productName}: ${formatQuantity(
          product.quantity
        )} vendido(s), ${currencyFormatter.format(product.revenue)}`
    )
    .join("; ");

  return `Produtos mais vendidos no mês atual: ${ranking}.`;
}

function getAssistantReply(prompt: string, context: ReplyContext) {
  const normalized = normalizePrompt(prompt);

  if (
    normalized.includes("resumo") ||
    normalized.includes("dashboard") ||
    normalized.includes("visao geral") ||
    normalized.includes("geral do mes")
  ) {
    return formatDashboardReply(context);
  }

  if (
    normalized.includes("faturamento") ||
    normalized.includes("receita") ||
    normalized.includes("lucro") ||
    (normalized.includes("venda") &&
      (normalized.includes("mes") ||
        normalized.includes("periodo") ||
        normalized.includes("quantas") ||
        normalized.includes("como estao")))
  ) {
    return formatFinancialReply(context);
  }

  if (
    normalized.includes("estoque baixo") ||
    normalized.includes("repor") ||
    normalized.includes("reposicao") ||
    normalized.includes("abaixo do minimo")
  ) {
    return formatLowStockReply(context);
  }

  if (
    normalized.includes("mais vendido") ||
    normalized.includes("mais venderam") ||
    normalized.includes("ranking") ||
    normalized.includes("produto vendido")
  ) {
    return formatBestSellersReply(context);
  }

  if (
    normalized.includes("estoque minimo") ||
    normalized.includes("ponto de reposicao") ||
    normalized.includes("quando repor")
  ) {
    return "Use o estoque mínimo como ponto de alerta para reposição. Uma boa regra inicial é colocar o mínimo suficiente para cobrir o tempo entre comprar o insumo e ele chegar, considerando sua média de uso.";
  }

  if (
    normalized.includes("preco") ||
    normalized.includes("margem") ||
    normalized.includes("precificacao")
  ) {
    return "Em Produtos, o Carbon Flow soma o custo dos insumos da composição e sugere preço com margem inicial de 30%. Você pode ajustar a margem ou informar um preço manual quando quiser.";
  }

  if (
    normalized.includes("historico") &&
    (normalized.includes("cliente") || normalized.includes("compras"))
  ) {
    return "Em Clientes, cada cadastro concentra dados de contato e histórico comercial. Isso ajuda a ver orçamentos, vendas e valores gastos por cliente.";
  }

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

export function VirtualAssistant({
  activeItem,
  companyId
}: VirtualAssistantProps) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
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
  const visibleQuickActions =
    quickActionsByPage[activeItem] ?? defaultQuickActions;
  const visibleQuickPrompts =
    quickPromptsByPage[activeItem] ?? defaultQuickPrompts;

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

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      setIsDashboardLoading(true);
      setDashboardError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("Sessão expirada. Entre novamente.");
        }

        const response = await fetch(`${env.apiUrl}/dashboard`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            "x-company-id": companyId
          }
        });
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            getApiMessage(payload, "Não foi possível carregar o dashboard.")
          );
        }

        if (isActive) {
          setDashboard(payload as DashboardSummary);
        }
      } catch (error) {
        if (isActive) {
          setDashboard(null);
          setDashboardError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados reais."
          );
        }
      } finally {
        if (isActive) {
          setIsDashboardLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isActive = false;
    };
  }, [companyId]);

  function sendPrompt(prompt: string) {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      return;
    }

    setMessages((current) => [
      ...current,
      { author: "user", text: cleanPrompt },
      {
        author: "assistant",
        text: getAssistantReply(cleanPrompt, {
          dashboard,
          dashboardError,
          isDashboardLoading
        })
      }
    ]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendPrompt(input);
  }

  function runQuickAction(action: QuickAction) {
    const actionId = action.actionId;
    const targetUrl = new URL(action.href, window.location.origin);
    const destination = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    const isSamePage = targetUrl.pathname === window.location.pathname;

    if (actionId) {
      storeAssistantAction(actionId);
    }

    setMessages((current) => [
      ...current,
      { author: "user", text: action.label },
      { author: "assistant", text: action.reply }
    ]);
    setIsOpen(false);

    router.push(destination);

    if (isSamePage && actionId) {
      window.requestAnimationFrame(() => emitAssistantAction(actionId));
    } else if (isSamePage && targetUrl.hash) {
      window.requestAnimationFrame(() => {
        document.getElementById(targetUrl.hash.slice(1))?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    }
  }

  return (
    <div className="fixed bottom-5 right-4 z-40 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <section className="mb-3 w-[min(calc(100vw-2rem),24rem)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] shadow-2xl shadow-[color:var(--shadow-color)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <AssistantAvatar
                className="h-12 w-12 shrink-0"
                sizes="48px"
                src={avatarSrc}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  Carbon
                </p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  Seu assistente virtual do Carbon Flow
                </p>
              </div>
            </div>

            <button
              aria-label="Fechar Carbon"
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
              {visibleQuickActions.map((item) => (
                <button
                  className="flex min-h-10 min-w-0 items-center gap-2 rounded-md border border-[var(--primary)] bg-[var(--primary-active)] px-2 text-left text-xs text-[var(--foreground)] transition hover:bg-[var(--secondary)]"
                  key={item.label}
                  onClick={() => runQuickAction(item)}
                  type="button"
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {visibleQuickPrompts.map((item) => (
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
        aria-label="Abrir Carbon, assistente virtual do Carbon Flow"
        className="ml-auto flex h-60 w-60 items-center justify-center rounded-full bg-transparent transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        onClick={() => {
          setMessages((current) => (current.length ? current : [introMessage]));
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <AssistantAvatar
          className="h-[13.5rem] w-[13.5rem]"
          sizes="216px"
          src={avatarSrc}
        />
      </button>
    </div>
  );
}
