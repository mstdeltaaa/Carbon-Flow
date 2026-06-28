"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
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
  Trash2,
  UserRound,
  UsersRound,
  Warehouse,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  emitAssistantAction,
  storeAssistantAction,
  type AssistantActionId
} from "@/features/assistant/assistant-actions";
import {
  canAccessSection,
  canConvertBudgets,
  canManageProducts,
  normalizeRole,
  type AppSection,
  type CompanyRole
} from "@/lib/access-control";
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
  requiresBudgetConversion?: boolean;
  requiresProductManagement?: boolean;
  sections?: AppSection[];
};

type QuickAction = {
  actionId?: AssistantActionId;
  href: string;
  icon: typeof Boxes;
  label: string;
  reply: string;
  requiresProductManagement?: boolean;
  section: AppSection;
};

type VirtualAssistantProps = {
  activeItem: string;
  companyId: string;
  role: string | null;
  userEmail: string;
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
  role: string | null;
};

type AssistantStatus = {
  className: string;
  label: string;
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
    prompt: "Quais produtos mais venderam?",
    sections: ["dashboard"]
  },
  budgetToSale: {
    icon: FileText,
    label: "Converter venda",
    prompt: "Como transformo orçamento em venda?",
    requiresBudgetConversion: true,
    sections: ["budgets", "sales"]
  },
  customerHistory: {
    icon: UsersRound,
    label: "Histórico cliente",
    prompt: "Como acompanho o histórico de um cliente?",
    sections: ["customers"]
  },
  dashboardSummary: {
    icon: BarChart3,
    label: "Resumo do mês",
    prompt: "Resumo do mês",
    sections: ["dashboard"]
  },
  firstSteps: {
    icon: HelpCircle,
    label: "Primeiros passos",
    prompt: "Por onde eu começo?"
  },
  ingredientCost: {
    icon: Boxes,
    label: "Custo insumo",
    prompt: "Como cadastro custo de insumo?",
    sections: ["ingredients"]
  },
  lowStock: {
    icon: AlertTriangle,
    label: "Estoque baixo",
    prompt: "Tem estoque baixo?",
    sections: ["dashboard"]
  },
  minimumStock: {
    icon: AlertTriangle,
    label: "Estoque mínimo",
    prompt: "Como defino estoque mínimo?",
    sections: ["ingredients"]
  },
  permissions: {
    icon: Settings,
    label: "Permissões",
    prompt: "Como funcionam permissões de usuários?",
    sections: ["settings"]
  },
  pricing: {
    icon: PackageCheck,
    label: "Preço sugerido",
    prompt: "Como calculo preço e margem?",
    sections: ["products"]
  },
  salesFlow: {
    icon: ShoppingCart,
    label: "Baixa estoque",
    prompt: "Como a venda baixa o estoque?",
    sections: ["sales", "stock"]
  },
  subscription: {
    icon: CreditCard,
    label: "Planos",
    prompt: "Como funcionam os planos?",
    sections: ["billing"]
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
    reply: "Vou abrir sua conta.",
    section: "account"
  },
  billing: {
    href: "/billing#app-content",
    icon: CreditCard,
    label: "Ver planos",
    reply: "Vou abrir a área de planos.",
    section: "billing"
  },
  createBudget: {
    actionId: "create-budget",
    href: "/budgets#budget-form",
    icon: FileText,
    label: "Novo orçamento",
    reply: "Vou te levar para o formulário de orçamento.",
    section: "budgets"
  },
  createIngredient: {
    actionId: "create-ingredient",
    href: "/ingredients#ingredient-form",
    icon: Plus,
    label: "Cadastrar insumo",
    reply: "Vou te levar para o cadastro de insumos.",
    section: "ingredients"
  },
  createProduct: {
    actionId: "create-product",
    href: "/products#product-form",
    icon: PackageCheck,
    label: "Criar produto",
    reply: "Vou abrir a criação de produto.",
    requiresProductManagement: true,
    section: "products"
  },
  customers: {
    href: "/customers#app-content",
    icon: UsersRound,
    label: "Ver clientes",
    reply: "Vou abrir a área de clientes.",
    section: "customers"
  },
  dashboard: {
    href: "/dashboard#app-content",
    icon: BarChart3,
    label: "Dashboard",
    reply: "Vou abrir o dashboard.",
    section: "dashboard"
  },
  history: {
    href: "/history#app-content",
    icon: History,
    label: "Histórico",
    reply: "Vou abrir o histórico.",
    section: "history"
  },
  openStockList: {
    actionId: "open-stock-list",
    href: "/stock#stock-list",
    icon: Warehouse,
    label: "Ver estoque",
    reply: "Vou abrir a visão de estoque.",
    section: "stock"
  },
  openStockMovement: {
    actionId: "open-stock-movement",
    href: "/stock#stock-movement-form",
    icon: ShoppingCart,
    label: "Lançar estoque",
    reply: "Vou abrir o lançamento de movimentação.",
    section: "stock"
  },
  sales: {
    href: "/sales#app-content",
    icon: ShoppingCart,
    label: "Ver vendas",
    reply: "Vou abrir a tela de vendas.",
    section: "sales"
  },
  settings: {
    href: "/settings#app-content",
    icon: Settings,
    label: "Configurações",
    reply: "Vou abrir as configurações.",
    section: "settings"
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
  { href: "/ingredients#app-content", label: "Insumos", section: "ingredients" },
  { href: "/products#app-content", label: "Produtos", section: "products" },
  { href: "/budgets#app-content", label: "Orçamentos", section: "budgets" },
  { href: "/sales#app-content", label: "Vendas", section: "sales" }
] satisfies Array<{
  href: string;
  label: string;
  section: AppSection;
}>;

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

const assistantConversationLimit = 20;
const assistantConversationVersion = 1;

function getConversationStorageKey(companyId: string, userEmail: string) {
  return [
    "carbon-flow-assistant-conversation",
    companyId,
    userEmail.trim().toLowerCase()
  ].join(":");
}

function isStoredMessage(value: unknown): value is Message {
  return (
    value !== null &&
    typeof value === "object" &&
    "author" in value &&
    (value.author === "assistant" || value.author === "user") &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function limitConversation(messages: Message[]) {
  return messages.slice(-assistantConversationLimit);
}

function readStoredConversation(storageKey: string) {
  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue) as unknown;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== assistantConversationVersion ||
      !("messages" in parsed) ||
      !Array.isArray(parsed.messages)
    ) {
      return null;
    }

    const messages = parsed.messages.filter(isStoredMessage);

    return messages.length ? limitConversation(messages) : null;
  } catch {
    return null;
  }
}

function writeStoredConversation(storageKey: string, messages: Message[]) {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        messages: limitConversation(messages),
        version: assistantConversationVersion
      })
    );
  } catch {
    // The assistant keeps working even if the browser blocks storage.
  }
}

function canUseQuickAction(action: QuickAction, role: string | null) {
  if (!canAccessSection(role, action.section)) {
    return false;
  }

  if (action.requiresProductManagement && !canManageProducts(role)) {
    return false;
  }

  return true;
}

function canUseQuickPrompt(prompt: QuickPrompt, role: string | null) {
  if (
    prompt.sections?.some((section) => !canAccessSection(role, section)) ??
    false
  ) {
    return false;
  }

  if (prompt.requiresBudgetConversion && !canConvertBudgets(role)) {
    return false;
  }

  if (prompt.requiresProductManagement && !canManageProducts(role)) {
    return false;
  }

  return true;
}

function uniqueByLabel<T extends { label: string }>(items: T[]) {
  const labels = new Set<string>();

  return items.filter((item) => {
    if (labels.has(item.label)) {
      return false;
    }

    labels.add(item.label);
    return true;
  });
}

function getVisibleQuickActions(activeItem: string, role: string | null) {
  return uniqueByLabel([
    ...(quickActionsByPage[activeItem] ?? defaultQuickActions),
    ...defaultQuickActions,
    quickActionById.dashboard,
    quickActionById.customers,
    quickActionById.account
  ])
    .filter((action) => canUseQuickAction(action, role))
    .slice(0, 3);
}

function getVisibleQuickPrompts(activeItem: string, role: string | null) {
  return uniqueByLabel([
    ...(quickPromptsByPage[activeItem] ?? defaultQuickPrompts),
    ...defaultQuickPrompts,
    quickPromptById.pricing,
    quickPromptById.customerHistory,
    quickPromptById.firstSteps
  ])
    .filter((prompt) => canUseQuickPrompt(prompt, role))
    .slice(0, 4);
}

function getVisibleNavigationLinks(role: string | null) {
  return navigationLinks.filter((item) => canAccessSection(role, item.section));
}

function getRoleLabel(role: string | null) {
  const normalizedRole = normalizeRole(role);

  const labels: Record<CompanyRole, string> = {
    admin: "Administrador",
    employee: "Funcionário",
    seller: "Vendedor"
  };

  return normalizedRole ? labels[normalizedRole] : "Perfil sem acesso";
}

function getRestrictedReply(sectionLabel: string) {
  return `Seu perfil atual não tem acesso a ${sectionLabel}. Se isso for necessário para o seu trabalho, peça para um administrador ajustar suas permissões.`;
}

function getAssistantStatus({
  canReadDashboard,
  dashboardError,
  isDashboardLoading
}: {
  canReadDashboard: boolean;
  dashboardError: string | null;
  isDashboardLoading: boolean;
}): AssistantStatus {
  if (!canReadDashboard) {
    return {
      className: "bg-[rgb(245_158_11/0.78)]",
      label: "Dados restritos ao perfil"
    };
  }

  if (isDashboardLoading) {
    return {
      className: "bg-[var(--primary)] animate-pulse",
      label: "Carregando dados"
    };
  }

  if (dashboardError) {
    return {
      className: "bg-[rgb(248_113_113/0.86)]",
      label: "Erro nos dados"
    };
  }

  return {
    className: "bg-[rgb(34_197_94/0.86)]",
    label: "Dados atualizados"
  };
}

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
  isDashboardLoading,
  role
}: ReplyContext) {
  if (!canAccessSection(role, "dashboard")) {
    return getRestrictedReply("os dados do dashboard");
  }

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

  return [
    "Resumo do mês atual:",
    `Faturamento: ${currencyFormatter.format(metrics.revenue)}`,
    `Vendas: ${metrics.salesCount}`,
    `Lucro estimado: ${currencyFormatter.format(metrics.estimatedProfit)}`,
    `Orçamentos em aberto: ${metrics.openBudgetCount} somando ${currencyFormatter.format(
      metrics.openBudgetAmount
    )}`,
    `Estoque: ${stockDetail}`,
    bestSellerDetail
  ].join("\n");
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
    .join("\n");

  return `Há ${dashboard.metrics.lowStockCount} insumo(s) em estoque baixo.\n${items}`;
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
    .join("\n");

  return `Produtos mais vendidos no mês atual:\n${ranking}`;
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
    if (!canAccessSection(context.role, "ingredients")) {
      return getRestrictedReply("o cadastro de insumos e estoque mínimo");
    }

    return "Use o estoque mínimo como ponto de alerta para reposição. Uma boa regra inicial é colocar o mínimo suficiente para cobrir o tempo entre comprar o insumo e ele chegar, considerando sua média de uso.";
  }

  if (
    normalized.includes("preco") ||
    normalized.includes("margem") ||
    normalized.includes("precificacao")
  ) {
    if (!canAccessSection(context.role, "products")) {
      return getRestrictedReply("produtos e precificação");
    }

    return "Em Produtos, o Carbon Flow soma o custo dos insumos da composição e sugere preço com margem inicial de 30%. Você pode ajustar a margem ou informar um preço manual quando quiser.";
  }

  if (
    normalized.includes("historico") &&
    (normalized.includes("cliente") || normalized.includes("compras"))
  ) {
    if (!canAccessSection(context.role, "customers")) {
      return getRestrictedReply("clientes");
    }

    return "Em Clientes, cada cadastro concentra dados de contato e histórico comercial. Isso ajuda a ver orçamentos, vendas e valores gastos por cliente.";
  }

  if (normalized.includes("comeco") || normalized.includes("primeiro")) {
    if (normalizeRole(context.role) === "seller") {
      return "Para vendedor, o melhor começo é consultar produtos, cadastrar clientes e criar orçamentos. Quando precisar de estoque, vendas finalizadas ou configurações, chame um administrador ou funcionário.";
    }

    return "Comece cadastrando os insumos, depois monte os produtos, cadastre clientes e então crie orçamentos. Quando um orçamento for aprovado, converta em venda para baixar estoque automaticamente.";
  }

  if (normalized.includes("insumo") || normalized.includes("materia")) {
    if (!canAccessSection(context.role, "ingredients")) {
      return getRestrictedReply("insumos");
    }

    return "Para cadastrar um insumo, vá em Insumos, clique em Novo insumo e informe nome, unidade, custo unitário, estoque atual e estoque mínimo. Esse custo será usado no cálculo dos produtos.";
  }

  if (normalized.includes("produto") || normalized.includes("composicao")) {
    if (!canAccessSection(context.role, "products")) {
      return getRestrictedReply("produtos");
    }

    if (
      (normalized.includes("criar") ||
        normalized.includes("cadastrar") ||
        normalized.includes("montar")) &&
      !canManageProducts(context.role)
    ) {
      return "Seu perfil pode consultar produtos, mas criar ou editar produtos fica para administradores e funcionários.";
    }

    return "Para criar um produto, vá em Produtos, clique em Novo produto e adicione os insumos da composição. O Carbon Flow calcula o custo e sugere o preço com base na margem.";
  }

  if (normalized.includes("estoque") || normalized.includes("baixa")) {
    if (!canAccessSection(context.role, "stock")) {
      return getRestrictedReply("estoque");
    }

    return "O estoque baixa automaticamente quando uma venda é criada a partir de produtos com composição. Também dá para acompanhar entradas, saídas e ajustes na tela Estoque.";
  }

  if (normalized.includes("orcamento") || normalized.includes("proposta")) {
    if (!canAccessSection(context.role, "budgets")) {
      return getRestrictedReply("orçamentos");
    }

    if (
      (normalized.includes("converter") || normalized.includes("venda")) &&
      !canConvertBudgets(context.role)
    ) {
      return "Seu perfil pode trabalhar com orçamentos, mas converter orçamento em venda e baixar estoque fica para administradores e funcionários.";
    }

    return "Em Orçamentos você seleciona cliente, produtos, quantidades, validade e observações. Depois pode imprimir ou abrir o documento profissional do orçamento.";
  }

  if (normalized.includes("venda") || normalized.includes("converter")) {
    if (
      normalized.includes("converter") &&
      !canConvertBudgets(context.role)
    ) {
      return "Seu perfil pode trabalhar com orçamentos, mas converter orçamento em venda e baixar estoque fica para administradores e funcionários.";
    }

    if (!canAccessSection(context.role, "sales")) {
      return getRestrictedReply("vendas");
    }

    return "Quando o cliente aprovar, use Converter em venda no orçamento. O sistema cria a venda, registra os itens e baixa os insumos do estoque.";
  }

  if (normalized.includes("cliente")) {
    if (!canAccessSection(context.role, "customers")) {
      return getRestrictedReply("clientes");
    }

    return "Em Clientes você cadastra nome, telefone, e-mail, endereço e observações. O histórico ajuda a acompanhar orçamentos, vendas e valores gastos.";
  }

  if (
    normalized.includes("usuario") ||
    normalized.includes("convite") ||
    normalized.includes("permiss")
  ) {
    if (!canAccessSection(context.role, "settings")) {
      return getRestrictedReply("configurações e permissões");
    }

    return "Em Configurações você gerencia usuários, convites e permissões. Administradores têm acesso total; vendedores e funcionários podem ter acesso limitado.";
  }

  if (normalized.includes("plano") || normalized.includes("assinatura")) {
    if (!canAccessSection(context.role, "billing")) {
      return getRestrictedReply("planos e assinatura");
    }

    return "Em Planos você acompanha os limites do plano atual e deixa a estrutura pronta para assinaturas futuras.";
  }

  if (normalized.includes("tema") || normalized.includes("cor")) {
    return "Você pode trocar a aparência pelo seletor de tema. A escolha fica salva no navegador para os próximos acessos.";
  }

  return "Posso ajudar com insumos, produtos, estoque, clientes, orçamentos, vendas, usuários e planos. Me diga o que você quer fazer que eu te oriento pelo fluxo.";
}

export function VirtualAssistant({
  activeItem,
  companyId,
  role,
  userEmail
}: VirtualAssistantProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [loadedConversationKey, setLoadedConversationKey] = useState<
    string | null
  >(null);
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
  const conversationStorageKey = useMemo(
    () => getConversationStorageKey(companyId, userEmail),
    [companyId, userEmail]
  );
  const canReadDashboard = canAccessSection(role, "dashboard");
  const avatarSrc = assistantAvatarByTheme[theme] ?? fallbackAssistantAvatar;
  const assistantStatus = getAssistantStatus({
    canReadDashboard,
    dashboardError,
    isDashboardLoading
  });
  const visibleNavigationLinks = getVisibleNavigationLinks(role);
  const visibleQuickActions = getVisibleQuickActions(activeItem, role);
  const visibleQuickPrompts = getVisibleQuickPrompts(activeItem, role);

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
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end"
      });
    });
  }, [isOpen, messages]);

  useEffect(() => {
    setLoadedConversationKey(null);

    const storedMessages = readStoredConversation(conversationStorageKey);

    setMessages(storedMessages ?? [introMessage]);
    setLoadedConversationKey(conversationStorageKey);
  }, [conversationStorageKey, introMessage]);

  useEffect(() => {
    if (loadedConversationKey !== conversationStorageKey) {
      return;
    }

    writeStoredConversation(conversationStorageKey, messages);
  }, [conversationStorageKey, loadedConversationKey, messages]);

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      if (!canReadDashboard) {
        setDashboard(null);
        setDashboardError(null);
        setIsDashboardLoading(false);
        return;
      }

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
  }, [canReadDashboard, companyId]);

  function sendPrompt(prompt: string) {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      return;
    }

    setMessages((current) =>
      limitConversation([
        ...current,
        { author: "user", text: cleanPrompt },
        {
          author: "assistant",
          text: getAssistantReply(cleanPrompt, {
            dashboard,
            dashboardError,
            isDashboardLoading,
            role
          })
        }
      ])
    );
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendPrompt(input);
  }

  function clearConversation() {
    const resetMessages = [introMessage];

    setMessages(resetMessages);

    try {
      window.localStorage.removeItem(conversationStorageKey);
    } catch {
      // The in-memory conversation was already reset.
    }
  }

  function runQuickAction(action: QuickAction) {
    if (!canUseQuickAction(action, role)) {
      setMessages((current) =>
        limitConversation([
          ...current,
          { author: "user", text: action.label },
          {
            author: "assistant",
            text: getRestrictedReply(action.label.toLowerCase())
          }
        ])
      );
      return;
    }

    const actionId = action.actionId;
    const targetUrl = new URL(action.href, window.location.origin);
    const destination = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    const isSamePage = targetUrl.pathname === window.location.pathname;

    if (actionId) {
      storeAssistantAction(actionId);
    }

    setMessages((current) =>
      limitConversation([
        ...current,
        { author: "user", text: action.label },
        { author: "assistant", text: action.reply }
      ])
    );
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
    <div className="fixed bottom-1 right-1 z-40 sm:bottom-2 sm:right-2 md:bottom-3 md:right-3 xl:bottom-6 xl:right-6">
      {isOpen ? (
        <section className="mb-3 flex max-h-[calc(100vh-6rem)] w-[min(calc(100vw-0.75rem),24rem)] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] shadow-2xl shadow-[color:var(--shadow-color)] sm:max-h-[calc(100vh-7rem)] md:max-h-[calc(100vh-8rem)] xl:max-h-[calc(100vh-17rem)] xl:w-[24rem]">
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
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4 text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={[
                        "h-1.5 w-1.5 rounded-full",
                        assistantStatus.className
                      ].join(" ")}
                    />
                    {assistantStatus.label}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Memória local
                  </span>
                  <span>{getRoleLabel(role)}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                aria-label="Limpar conversa do Carbon"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                onClick={clearConversation}
                title="Limpar conversa"
                type="button"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                aria-label="Fechar Carbon"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                className={[
                  "whitespace-pre-line rounded-md px-3 py-2 text-sm leading-6",
                  message.author === "assistant"
                    ? "mr-8 bg-[var(--surface-soft)] text-[var(--muted-foreground)]"
                    : "ml-8 bg-[var(--primary-active)] text-[var(--foreground)]"
                ].join(" ")}
                key={`${message.author}-${index}`}
              >
                {message.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 border-t border-[var(--border)] p-3 sm:p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-normal text-[var(--muted-foreground)]">
              Ações rápidas
            </p>
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

            <p className="mb-2 text-[11px] font-medium uppercase tracking-normal text-[var(--muted-foreground)]">
              Perguntas úteis
            </p>
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

            {visibleNavigationLinks.length ? (
              <>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-normal text-[var(--muted-foreground)]">
                  Navegação
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {visibleNavigationLinks.map((item) => (
                    <Link
                      className="rounded-md bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--primary)] transition hover:bg-[var(--secondary)]"
                      href={item.href}
                      key={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </>
            ) : null}

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
        className="ml-auto flex h-20 w-20 items-center justify-center rounded-full bg-transparent transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 xl:h-60 xl:w-60"
        onClick={() => {
          setMessages((current) => (current.length ? current : [introMessage]));
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <AssistantAvatar
          className="h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28 xl:h-[13.5rem] xl:w-[13.5rem]"
          sizes="(min-width: 1280px) 216px, (min-width: 1024px) 112px, (min-width: 768px) 96px, (min-width: 640px) 80px, 72px"
          src={avatarSrc}
        />
      </button>
    </div>
  );
}
