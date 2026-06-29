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
  WalletCards,
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
  type CompanyPermissionMap,
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
  permissions: CompanyPermissionMap | null;
  role: string | null;
  userEmail: string;
};

type AssistantChatResponse = {
  answer: string;
  model?: string;
  source: "ai" | "fallback" | "not_configured";
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
    overdueAmount: number;
    overdueCount: number;
    paidExpense: number;
    paidIncome: number;
    pendingExpense: number;
    pendingIncome: number;
    revenue: number;
    salesCount: number;
  };
  finance?: {
    balance: number;
    paidExpense: number;
    paidIncome: number;
    pendingBalance: number;
    pendingExpense: number;
    pendingIncome: number;
    upcomingDue: Array<{
      amount: number;
      category: string;
      description: string;
      dueDate: string | null;
      id: string;
      isOverdue: boolean;
      type: "income" | "expense";
    }>;
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

type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

type AssistantBudget = {
  id: string;
  customer: {
    name: string;
  } | null;
  numberLabel: string;
  status: BudgetStatus;
  totalAmount: number;
  validUntil: string | null;
};

type AssistantCustomer = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  summary: {
    budgetsCount: number;
    estimatedProfit: number;
    lastSaleAt: string | null;
    openBudgetsCount: number;
    salesCount: number;
    totalSpent: number;
  };
};

type AssistantSale = {
  id: string;
  customer: {
    name: string;
  } | null;
  estimatedProfit: number;
  numberLabel: string;
  soldAt: string;
  status: "completed" | "cancelled" | "refunded";
  totalAmount: number;
};

type ReplyContext = {
  budgets: AssistantBudget[];
  budgetsError: string | null;
  customers: AssistantCustomer[];
  customersError: string | null;
  dashboard: DashboardSummary | null;
  dashboardError: string | null;
  isBudgetsLoading: boolean;
  isCustomersLoading: boolean;
  isDashboardLoading: boolean;
  isSalesLoading: boolean;
  mode: AssistantMode;
  permissions: CompanyPermissionMap | null;
  role: string | null;
  sales: AssistantSale[];
  salesError: string | null;
};

type AssistantMode = "general" | "pricing" | "sales" | "stock";

type AssistantStatus = {
  className: string;
  label: string;
};

type ProactiveAlert = {
  action: QuickAction;
  detail: string;
  id: string;
  severity: "info" | "warning";
  title: string;
};

type AssistantPreferences = {
  dismissedAlertIds: string[];
  mode: AssistantMode;
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
  finance:
    "Em Financeiro você acompanha receitas, despesas, saldo do período e lançamentos gerados pelas vendas.",
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
  customerOpportunities: {
    icon: UserRound,
    label: "Oportunidades",
    prompt: "Tem clientes sem venda ou sem contato?",
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
  pendingBudgets: {
    icon: FileText,
    label: "Pendentes",
    prompt: "Quais orçamentos estão pendentes?",
    sections: ["budgets"]
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
  recentSales: {
    icon: ShoppingCart,
    label: "Vendas recentes",
    prompt: "Quais foram as vendas recentes?",
    sections: ["sales"]
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
  },
  topCustomers: {
    icon: UsersRound,
    label: "Top clientes",
    prompt: "Quais clientes mais compraram?",
    sections: ["customers"]
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
    quickPromptById.pendingBudgets,
    quickPromptById.budgetToSale,
    quickPromptById.pricing
  ],
  customers: [
    quickPromptById.topCustomers,
    quickPromptById.pendingBudgets,
    quickPromptById.customerOpportunities,
    quickPromptById.customerHistory
  ],
  dashboard: [
    quickPromptById.dashboardSummary,
    quickPromptById.topCustomers,
    quickPromptById.pendingBudgets,
    quickPromptById.lowStock
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
    quickPromptById.recentSales,
    quickPromptById.topCustomers,
    quickPromptById.salesFlow,
    quickPromptById.dashboardSummary
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

const assistantModeOptions = [
  {
    icon: HelpCircle,
    id: "general",
    label: "Geral"
  },
  {
    icon: PackageCheck,
    id: "pricing",
    label: "Preço"
  },
  {
    icon: Warehouse,
    id: "stock",
    label: "Estoque"
  },
  {
    icon: ShoppingCart,
    id: "sales",
    label: "Vendas"
  }
] satisfies Array<{
  icon: typeof Boxes;
  id: AssistantMode;
  label: string;
}>;

const quickPromptsByMode: Record<AssistantMode, QuickPrompt[]> = {
  general: [],
  pricing: [
    quickPromptById.pricing,
    quickPromptById.ingredientCost,
    quickPromptById.bestSellers
  ],
  sales: [
    quickPromptById.pendingBudgets,
    quickPromptById.recentSales,
    quickPromptById.topCustomers,
    quickPromptById.customerOpportunities
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
  budgets: {
    href: "/budgets#app-content",
    icon: FileText,
    label: "Ver orçamentos",
    reply: "Vou abrir a área de orçamentos.",
    section: "budgets"
  },
  createBudget: {
    actionId: "create-budget",
    href: "/budgets#budget-form",
    icon: FileText,
    label: "Novo orçamento",
    reply: "Vou te levar para o formulário de orçamento.",
    section: "budgets"
  },
  createCustomer: {
    actionId: "create-customer",
    href: "/customers#customer-form",
    icon: UserRound,
    label: "Novo cliente",
    reply: "Vou te levar para o cadastro de cliente.",
    section: "customers"
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
  finance: {
    href: "/finance#app-content",
    icon: WalletCards,
    label: "Financeiro",
    reply: "Vou abrir o financeiro.",
    section: "finance"
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
    quickActionById.createCustomer,
    quickActionById.createBudget,
    quickActionById.sales
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
  finance: [
    quickActionById.finance,
    quickActionById.sales,
    quickActionById.dashboard
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
  {
    href: "/ingredients#app-content",
    label: "Insumos",
    section: "ingredients"
  },
  { href: "/products#app-content", label: "Produtos", section: "products" },
  { href: "/budgets#app-content", label: "Orçamentos", section: "budgets" },
  { href: "/sales#app-content", label: "Vendas", section: "sales" },
  { href: "/finance#app-content", label: "Financeiro", section: "finance" }
] satisfies Array<{
  href: string;
  label: string;
  section: AppSection;
}>;

const fallbackAssistantAvatar = "/brand/AvatarBrancoePreto/BrancoePreto.png";

const assistantAvatarByTheme: Record<string, string> = {
  "brazil-2026": "/brand/AvatarBrasil2026/Copa2026Amarelo.png",
  "brazil-2026-blue":
    "/brand/AvatarBrasil2026/AvatarCopa2026Azul/Copa2026Azul.png",
  "blue-dark": "/brand/AvatarAzulePreto/AzulePreto.png",
  "blue-light": "/brand/AvatarAzuleBranco/AzuleBranco.png",
  "carbon-dark": fallbackAssistantAvatar,
  "carbon-light": "/brand/AvatarPretoeBranco/PretoeBranco.png",
  "green-dark": "/brand/AvatarVerdeePreto/VerdeePreto.png",
  "green-light": "/brand/AvatarVerdeeBranco/VerdeeBranco.png"
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
    <span className={["relative block", className].join(" ")}>
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

const dateFormatter = new Intl.DateTimeFormat("pt-BR");

const budgetStatusLabels: Record<BudgetStatus, string> = {
  approved: "Aprovado",
  cancelled: "Cancelado",
  converted: "Convertido",
  draft: "Rascunho",
  expired: "Expirado",
  rejected: "Recusado",
  sent: "Enviado"
};

const assistantConversationLimit = 20;
const assistantConversationVersion = 1;
const assistantPreferencesVersion = 1;

function getConversationStorageKey(companyId: string, userEmail: string) {
  return [
    "carbon-flow-assistant-conversation",
    companyId,
    userEmail.trim().toLowerCase()
  ].join(":");
}

function getPreferencesStorageKey(companyId: string, userEmail: string) {
  return [
    "carbon-flow-assistant-preferences",
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

function isAssistantMode(value: unknown): value is AssistantMode {
  return (
    value === "general" ||
    value === "pricing" ||
    value === "sales" ||
    value === "stock"
  );
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

function readStoredAssistantPreferences(storageKey: string) {
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
      parsed.version !== assistantPreferencesVersion
    ) {
      return null;
    }

    const mode =
      "mode" in parsed && isAssistantMode(parsed.mode)
        ? parsed.mode
        : "general";
    const dismissedAlertIds =
      "dismissedAlertIds" in parsed && Array.isArray(parsed.dismissedAlertIds)
        ? parsed.dismissedAlertIds.filter(
            (item): item is string => typeof item === "string"
          )
        : [];

    return {
      dismissedAlertIds,
      mode
    } satisfies AssistantPreferences;
  } catch {
    return null;
  }
}

function writeStoredAssistantPreferences(
  storageKey: string,
  preferences: AssistantPreferences
) {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...preferences,
        dismissedAlertIds: preferences.dismissedAlertIds.slice(-20),
        version: assistantPreferencesVersion
      })
    );
  } catch {
    // Preferences are nice to have, but the assistant can work without them.
  }
}

function canUseQuickAction(
  action: QuickAction,
  role: string | null,
  permissions: CompanyPermissionMap | null
) {
  if (!canAccessSection(role, action.section, permissions)) {
    return false;
  }

  if (
    action.requiresProductManagement &&
    !canManageProducts(role, permissions)
  ) {
    return false;
  }

  return true;
}

function canUseQuickPrompt(
  prompt: QuickPrompt,
  role: string | null,
  permissions: CompanyPermissionMap | null
) {
  if (
    prompt.sections?.some(
      (section) => !canAccessSection(role, section, permissions)
    ) ??
    false
  ) {
    return false;
  }

  if (
    prompt.requiresBudgetConversion &&
    !canConvertBudgets(role, permissions)
  ) {
    return false;
  }

  if (
    prompt.requiresProductManagement &&
    !canManageProducts(role, permissions)
  ) {
    return false;
  }

  return true;
}

function canUseAssistantMode(
  mode: AssistantMode,
  role: string | null,
  permissions: CompanyPermissionMap | null
) {
  if (mode === "general") {
    return true;
  }

  if (mode === "pricing") {
    return canAccessSection(role, "products", permissions);
  }

  if (mode === "stock") {
    return (
      canAccessSection(role, "stock", permissions) ||
      canAccessSection(role, "ingredients", permissions)
    );
  }

  return (
    canAccessSection(role, "sales", permissions) ||
    canAccessSection(role, "budgets", permissions) ||
    canAccessSection(role, "customers", permissions)
  );
}

function getAvailableAssistantModes(
  role: string | null,
  permissions: CompanyPermissionMap | null
) {
  return assistantModeOptions.filter((mode) =>
    canUseAssistantMode(mode.id, role, permissions)
  );
}

function getAssistantModeLabel(mode: AssistantMode) {
  return (
    assistantModeOptions.find((item) => item.id === mode)?.label ?? "Geral"
  );
}

function getAssistantModeIntro(mode: AssistantMode) {
  if (mode === "pricing") {
    return "Modo Preço ativado. Vou priorizar custo dos insumos, margem, preço sugerido e produtos com melhor retorno.";
  }

  if (mode === "stock") {
    return "Modo Estoque ativado. Vou priorizar reposição, estoque mínimo, movimentações e baixa automática.";
  }

  if (mode === "sales") {
    return "Modo Vendas ativado. Vou priorizar orçamentos, clientes, vendas recentes e oportunidades comerciais.";
  }

  return "Modo Geral ativado. Vou equilibrar dashboard, produção, estoque, clientes e vendas.";
}

function getRequestedAssistantMode(prompt: string): AssistantMode | null {
  const normalized = normalizePrompt(prompt);

  if (
    !hasAnyTerm(normalized, [
      "consultor",
      "especialista",
      "foco",
      "modo",
      "prioriza",
      "priorizar"
    ])
  ) {
    return null;
  }

  if (hasAnyTerm(normalized, ["preco", "precificacao", "margem", "custo"])) {
    return "pricing";
  }

  if (
    hasAnyTerm(normalized, [
      "estoque",
      "insumo",
      "reposicao",
      "repor",
      "movimentacao"
    ])
  ) {
    return "stock";
  }

  if (
    hasAnyTerm(normalized, [
      "cliente",
      "comercial",
      "orcamento",
      "proposta",
      "venda"
    ])
  ) {
    return "sales";
  }

  if (hasAnyTerm(normalized, ["geral", "normal", "padrao", "todos"])) {
    return "general";
  }

  return null;
}

function hasAnyTerm(prompt: string, terms: string[]) {
  return terms.some((term) => prompt.includes(term));
}

function startsAsQuestion(prompt: string) {
  return [
    "como ",
    "o que ",
    "oque ",
    "qual ",
    "quais ",
    "quando ",
    "quanto ",
    "quantos ",
    "tem ",
    "existe "
  ].some((prefix) => prompt.startsWith(prefix));
}

function getDirectQuickAction(prompt: string) {
  const normalized = normalizePrompt(prompt);

  if (startsAsQuestion(normalized)) {
    return null;
  }

  const wantsCreation = hasAnyTerm(normalized, [
    "adicionar",
    "adicione",
    "cadastrar",
    "cadastre",
    "comecar",
    "criar",
    "crie",
    "faca",
    "fazer",
    "iniciar",
    "montar",
    "monte",
    "novo",
    "nova"
  ]);
  const wantsNavigation = hasAnyTerm(normalized, [
    "abrir",
    "abre",
    "acessar",
    "ir para",
    "ir pra",
    "leve",
    "leva",
    "listar",
    "mostra",
    "mostrar",
    "va para",
    "ver"
  ]);

  if (!wantsCreation && !wantsNavigation) {
    return null;
  }

  if (wantsCreation && hasAnyTerm(normalized, ["cliente"])) {
    return quickActionById.createCustomer;
  }

  if (wantsCreation && hasAnyTerm(normalized, ["orcamento", "proposta"])) {
    return quickActionById.createBudget;
  }

  if (
    wantsCreation &&
    hasAnyTerm(normalized, ["insumo", "materia", "materia prima"])
  ) {
    return quickActionById.createIngredient;
  }

  if (wantsCreation && hasAnyTerm(normalized, ["produto", "composicao"])) {
    return quickActionById.createProduct;
  }

  if (
    hasAnyTerm(normalized, [
      "entrada",
      "lancar",
      "movimentacao",
      "saida",
      "ajuste"
    ]) &&
    hasAnyTerm(normalized, ["estoque", "insumo"])
  ) {
    return quickActionById.openStockMovement;
  }

  if (
    wantsNavigation &&
    hasAnyTerm(normalized, ["estoque", "estoque baixo", "reposicao", "repor"])
  ) {
    return quickActionById.openStockList;
  }

  if (
    wantsNavigation &&
    hasAnyTerm(normalized, ["orcamento", "orcamentos", "proposta"])
  ) {
    return quickActionById.budgets;
  }

  if (wantsNavigation && hasAnyTerm(normalized, ["cliente", "clientes"])) {
    return quickActionById.customers;
  }

  if (wantsNavigation && hasAnyTerm(normalized, ["venda", "vendas"])) {
    return quickActionById.sales;
  }

  if (
    wantsNavigation &&
    hasAnyTerm(normalized, [
      "caixa",
      "despesa",
      "despesas",
      "financeiro",
      "financas",
      "receita",
      "receitas",
      "saldo"
    ])
  ) {
    return quickActionById.finance;
  }

  if (
    wantsNavigation &&
    hasAnyTerm(normalized, ["dashboard", "inicio", "resumo", "visao geral"])
  ) {
    return quickActionById.dashboard;
  }

  if (
    wantsNavigation &&
    hasAnyTerm(normalized, ["plano", "planos", "assinatura"])
  ) {
    return quickActionById.billing;
  }

  if (
    wantsNavigation &&
    hasAnyTerm(normalized, [
      "configuracao",
      "configuracoes",
      "permissao",
      "usuario"
    ])
  ) {
    return quickActionById.settings;
  }

  if (wantsNavigation && hasAnyTerm(normalized, ["historico", "auditoria"])) {
    return quickActionById.history;
  }

  if (wantsNavigation && hasAnyTerm(normalized, ["conta", "perfil"])) {
    return quickActionById.account;
  }

  return null;
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

function getVisibleQuickActions(
  activeItem: string,
  role: string | null,
  permissions: CompanyPermissionMap | null
) {
  return uniqueByLabel([
    ...(quickActionsByPage[activeItem] ?? defaultQuickActions),
    ...defaultQuickActions,
    quickActionById.dashboard,
    quickActionById.customers,
    quickActionById.account
  ])
    .filter((action) => canUseQuickAction(action, role, permissions))
    .slice(0, 3);
}

function getVisibleQuickPrompts(
  activeItem: string,
  role: string | null,
  permissions: CompanyPermissionMap | null,
  mode: AssistantMode
) {
  return uniqueByLabel([
    ...quickPromptsByMode[mode],
    ...(quickPromptsByPage[activeItem] ?? defaultQuickPrompts),
    ...defaultQuickPrompts,
    quickPromptById.pendingBudgets,
    quickPromptById.topCustomers,
    quickPromptById.recentSales,
    quickPromptById.pricing,
    quickPromptById.customerHistory,
    quickPromptById.firstSteps
  ])
    .filter((prompt) => canUseQuickPrompt(prompt, role, permissions))
    .slice(0, 4);
}

function getVisibleNavigationLinks(
  role: string | null,
  permissions: CompanyPermissionMap | null
) {
  return navigationLinks.filter((item) =>
    canAccessSection(role, item.section, permissions)
  );
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

function formatDate(value: string | null) {
  if (!value) {
    return "sem validade";
  }

  return dateFormatter.format(
    value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`)
  );
}

function getOpenBudgets(budgets: AssistantBudget[]) {
  return budgets
    .filter((budget) => ["draft", "sent", "approved"].includes(budget.status))
    .sort((a, b) => {
      const statusPriority: Record<BudgetStatus, number> = {
        approved: 0,
        sent: 1,
        draft: 2,
        expired: 3,
        rejected: 4,
        cancelled: 5,
        converted: 6
      };

      return statusPriority[a.status] - statusPriority[b.status];
    });
}

function getDaysUntil(value: string | null) {
  if (!value) {
    return null;
  }

  const today = new Date();
  const target = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00`);

  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function getProactiveAlerts(context: ReplyContext): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [];

  if (
    canAccessSection(context.role, "stock", context.permissions) &&
    context.dashboard &&
    !context.dashboardError &&
    context.dashboard.metrics.lowStockCount > 0
  ) {
    const firstItem = context.dashboard.lowStock[0];
    const detail = firstItem
      ? `${firstItem.name} está abaixo do mínimo. Ao todo, ${context.dashboard.metrics.lowStockCount} insumo(s) precisam de atenção.`
      : `${context.dashboard.metrics.lowStockCount} insumo(s) precisam de reposição.`;

    alerts.push({
      action: quickActionById.openStockList,
      detail,
      id: `low-stock:${context.dashboard.metrics.lowStockCount}:${firstItem?.id ?? "none"}`,
      severity: "warning",
      title: "Estoque baixo"
    });
  }

  if (
    canAccessSection(context.role, "budgets", context.permissions) &&
    !context.isBudgetsLoading &&
    !context.budgetsError
  ) {
    const openBudgets = getOpenBudgets(context.budgets);
    const approvedBudgets = openBudgets.filter(
      (budget) => budget.status === "approved"
    );
    const budgetsDueSoon = openBudgets.filter((budget) => {
      const daysUntil = getDaysUntil(budget.validUntil);

      return (
        budget.status !== "approved" &&
        daysUntil !== null &&
        daysUntil >= 0 &&
        daysUntil <= 3
      );
    });

    if (approvedBudgets.length > 0) {
      const approvedTotal = approvedBudgets.reduce(
        (total, budget) => total + budget.totalAmount,
        0
      );
      const detail = canConvertBudgets(context.role, context.permissions)
        ? `${approvedBudgets.length} orçamento(s) aprovado(s) somando ${currencyFormatter.format(
            approvedTotal
          )} já podem virar venda.`
        : `${approvedBudgets.length} orçamento(s) aprovado(s) dependem de administrador ou funcionário para virar venda.`;

      alerts.push({
        action: quickActionById.budgets,
        detail,
        id: `approved-budgets:${approvedBudgets.length}:${approvedTotal}`,
        severity: canConvertBudgets(context.role, context.permissions)
          ? "warning"
          : "info",
        title: "Orçamentos aprovados"
      });
    }

    if (budgetsDueSoon.length > 0) {
      alerts.push({
        action: quickActionById.budgets,
        detail: `${budgetsDueSoon.length} orçamento(s) vencem nos próximos 3 dias. Vale revisar antes que esfriem.`,
        id: `budgets-due-soon:${budgetsDueSoon.length}:${budgetsDueSoon[0]?.id ?? "none"}`,
        severity: "info",
        title: "Orçamentos vencendo"
      });
    }
  }

  if (
    canAccessSection(context.role, "customers", context.permissions) &&
    !context.isCustomersLoading &&
    !context.customersError &&
    context.customers.length > 0
  ) {
    const customersWithoutSales = context.customers.filter(
      (customer) => customer.summary.salesCount === 0
    ).length;
    const customersWithoutContact = context.customers.filter(
      (customer) => !customer.phone && !customer.email
    ).length;
    const customersWithOpenBudgets = context.customers.filter(
      (customer) => customer.summary.openBudgetsCount > 0
    ).length;

    if (
      customersWithoutSales > 0 ||
      customersWithoutContact > 0 ||
      customersWithOpenBudgets > 0
    ) {
      alerts.push({
        action: quickActionById.customers,
        detail: `${customersWithoutSales} sem venda, ${customersWithoutContact} sem contato e ${customersWithOpenBudgets} com orçamento em aberto.`,
        id: `customer-opportunities:${customersWithoutSales}:${customersWithoutContact}:${customersWithOpenBudgets}`,
        severity: "info",
        title: "Oportunidades em clientes"
      });
    }
  }

  return alerts.slice(0, 3);
}

function getProactiveAlertClasses(severity: ProactiveAlert["severity"]) {
  if (severity === "warning") {
    return {
      dot: "bg-[rgb(245_158_11/0.9)]",
      panel:
        "border-[rgb(245_158_11/0.35)] bg-[rgb(245_158_11/0.10)] hover:bg-[rgb(245_158_11/0.14)]",
      title: "text-[rgb(251_191_36)]"
    };
  }

  return {
    dot: "bg-[var(--primary)]",
    panel:
      "border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--secondary)]",
    title: "text-[var(--primary)]"
  };
}

function getRealDataUnavailableReply({
  dashboard,
  dashboardError,
  isDashboardLoading,
  permissions,
  role
}: ReplyContext) {
  if (!canAccessSection(role, "dashboard", permissions)) {
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
  const finance = dashboard.finance ?? {
    balance: 0,
    paidExpense: 0,
    paidIncome: 0,
    pendingBalance: 0,
    pendingExpense: 0,
    pendingIncome: 0,
    upcomingDue: []
  };
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
    `Saldo financeiro: ${currencyFormatter.format(finance.balance)}`,
    `Pendências vencidas: ${metrics.overdueCount} somando ${currencyFormatter.format(
      metrics.overdueAmount
    )}`,
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

  const dashboard = context.dashboard!;
  const metrics = dashboard.metrics;
  const finance = dashboard.finance ?? {
    balance: 0,
    paidExpense: 0,
    paidIncome: 0,
    pendingBalance: 0,
    pendingExpense: 0,
    pendingIncome: 0,
    upcomingDue: []
  };
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
  )}.${margin}
No financeiro, entraram ${currencyFormatter.format(
    finance.paidIncome
  )}, saíram ${currencyFormatter.format(
    finance.paidExpense
  )} e o saldo está em ${currencyFormatter.format(finance.balance)}.
Pendências vencidas: ${metrics.overdueCount}, somando ${currencyFormatter.format(
    metrics.overdueAmount
  )}.`;
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
  const hiddenCount =
    dashboard.metrics.lowStockCount > dashboard.lowStock.length
      ? `\n+ ${dashboard.metrics.lowStockCount - dashboard.lowStock.length} outro(s) item(ns) abaixo do mínimo`
      : "";
  const actionHint = canAccessSection(
    context.role,
    "stock",
    context.permissions
  )
    ? "Ação recomendada: abrir Estoque e lançar entrada ou ajuste nos itens críticos."
    : "Ação recomendada: peça para um administrador ou funcionário revisar a reposição.";

  return `Há ${dashboard.metrics.lowStockCount} insumo(s) em estoque baixo.
${items}${hiddenCount}
${actionHint}`;
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

function formatPendingBudgetsReply(context: ReplyContext) {
  if (!canAccessSection(context.role, "budgets", context.permissions)) {
    return getRestrictedReply("orçamentos");
  }

  if (context.isBudgetsLoading) {
    return "Estou carregando os orçamentos da empresa. Tente perguntar de novo em alguns segundos.";
  }

  if (context.budgetsError) {
    return `Ainda não consegui carregar os orçamentos. Motivo: ${context.budgetsError}`;
  }

  const openBudgets = getOpenBudgets(context.budgets);

  if (openBudgets.length === 0) {
    return "Não há orçamentos pendentes agora. A fila comercial está limpa.";
  }

  const totalAmount = openBudgets.reduce(
    (total, budget) => total + budget.totalAmount,
    0
  );
  const approvedCount = openBudgets.filter(
    (budget) => budget.status === "approved"
  ).length;
  const items = openBudgets
    .slice(0, 5)
    .map((budget) => {
      const customer = budget.customer?.name ?? "sem cliente";

      return `${budget.numberLabel} - ${customer} - ${
        budgetStatusLabels[budget.status]
      } - ${currencyFormatter.format(budget.totalAmount)} - validade ${formatDate(
        budget.validUntil
      )}`;
    })
    .join("\n");
  const hiddenCount =
    openBudgets.length > 5 ? `\n+ ${openBudgets.length - 5} outro(s)` : "";
  const nextStep =
    approvedCount > 0 && canConvertBudgets(context.role, context.permissions)
      ? `${approvedCount} orçamento(s) aprovado(s) já podem virar venda.`
      : approvedCount > 0
        ? `${approvedCount} orçamento(s) aprovado(s) dependem de administrador ou funcionário para virar venda.`
        : "Próximo passo: revisar rascunhos e acompanhar os enviados.";

  return `Orçamentos pendentes: ${openBudgets.length}
Valor em aberto: ${currencyFormatter.format(totalAmount)}
${items}${hiddenCount}
${nextStep}`;
}

function formatTopCustomersReply(context: ReplyContext) {
  if (!canAccessSection(context.role, "customers", context.permissions)) {
    return getRestrictedReply("clientes");
  }

  if (context.isCustomersLoading) {
    return "Estou carregando os clientes da empresa. Tente perguntar de novo em alguns segundos.";
  }

  if (context.customersError) {
    return `Ainda não consegui carregar os clientes. Motivo: ${context.customersError}`;
  }

  const customersWithSales = context.customers
    .filter((customer) => customer.summary.totalSpent > 0)
    .sort((a, b) => b.summary.totalSpent - a.summary.totalSpent);

  if (customersWithSales.length === 0) {
    return "Ainda não há clientes com vendas registradas. Quando as vendas entrarem, eu mostro quem mais comprou.";
  }

  const ranking = customersWithSales
    .slice(0, 5)
    .map((customer, index) => {
      const lastSale = customer.summary.lastSaleAt
        ? `, última venda em ${formatDate(customer.summary.lastSaleAt)}`
        : "";

      return `${index + 1}. ${customer.name}: ${currencyFormatter.format(
        customer.summary.totalSpent
      )} em ${customer.summary.salesCount} venda(s)${lastSale}`;
    })
    .join("\n");
  const hiddenCount =
    customersWithSales.length > 5
      ? `\n+ ${customersWithSales.length - 5} outro(s) cliente(s) com compras`
      : "";

  return `Clientes que mais compraram:
${ranking}${hiddenCount}`;
}

function formatCustomerOpportunitiesReply(context: ReplyContext) {
  if (!canAccessSection(context.role, "customers", context.permissions)) {
    return getRestrictedReply("clientes");
  }

  if (context.isCustomersLoading) {
    return "Estou carregando os clientes da empresa. Tente perguntar de novo em alguns segundos.";
  }

  if (context.customersError) {
    return `Ainda não consegui carregar os clientes. Motivo: ${context.customersError}`;
  }

  const customersWithoutSales = context.customers.filter(
    (customer) => customer.summary.salesCount === 0
  );
  const customersWithoutContact = context.customers.filter(
    (customer) => !customer.phone && !customer.email
  );
  const customersWithOpenBudgets = context.customers
    .filter((customer) => customer.summary.openBudgetsCount > 0)
    .sort((a, b) => b.summary.openBudgetsCount - a.summary.openBudgetsCount);
  const openBudgetNames = customersWithOpenBudgets
    .slice(0, 5)
    .map(
      (customer) =>
        `${customer.name}: ${customer.summary.openBudgetsCount} orçamento(s) em aberto`
    )
    .join("\n");

  if (
    customersWithoutSales.length === 0 &&
    customersWithoutContact.length === 0 &&
    customersWithOpenBudgets.length === 0
  ) {
    return "Não encontrei oportunidades óbvias nos clientes agora. Todos têm contato, não há clientes sem venda e não há orçamentos em aberto por cliente.";
  }

  return [
    "Oportunidades em clientes:",
    `Clientes sem venda: ${customersWithoutSales.length}`,
    `Clientes sem telefone/e-mail: ${customersWithoutContact.length}`,
    `Clientes com orçamento em aberto: ${customersWithOpenBudgets.length}`,
    openBudgetNames ? `Principais pendências:\n${openBudgetNames}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function formatRecentSalesReply(context: ReplyContext) {
  if (!canAccessSection(context.role, "sales", context.permissions)) {
    return getRestrictedReply("vendas");
  }

  if (context.isSalesLoading) {
    return "Estou carregando as vendas da empresa. Tente perguntar de novo em alguns segundos.";
  }

  if (context.salesError) {
    return `Ainda não consegui carregar as vendas. Motivo: ${context.salesError}`;
  }

  const recentSales = [...context.sales]
    .filter((sale) => sale.status === "completed")
    .sort(
      (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()
    );

  if (recentSales.length === 0) {
    return "Ainda não há vendas concluídas registradas.";
  }

  const totalAmount = recentSales.reduce(
    (total, sale) => total + sale.totalAmount,
    0
  );
  const totalProfit = recentSales.reduce(
    (total, sale) => total + sale.estimatedProfit,
    0
  );
  const items = recentSales
    .slice(0, 5)
    .map((sale) => {
      const customer = sale.customer?.name ?? "sem cliente";

      return `${sale.numberLabel} - ${customer} - ${currencyFormatter.format(
        sale.totalAmount
      )} - ${formatDate(sale.soldAt)}`;
    })
    .join("\n");
  const hiddenCount =
    recentSales.length > 5
      ? `\n+ ${recentSales.length - 5} outra(s) venda(s)`
      : "";

  return `Vendas concluídas: ${recentSales.length}
Faturamento carregado: ${currencyFormatter.format(totalAmount)}
Lucro estimado: ${currencyFormatter.format(totalProfit)}
Vendas recentes:
${items}${hiddenCount}`;
}

function formatModeFirstStepsReply(context: ReplyContext) {
  if (context.mode === "pricing") {
    if (!canAccessSection(context.role, "products", context.permissions)) {
      return getRestrictedReply("produtos e precificação");
    }

    return "No modo Preço, comece conferindo se todos os insumos têm custo unitário correto. Depois revise a composição dos produtos, confira o custo calculado e ajuste a margem quando o preço sugerido não fizer sentido para o mercado.";
  }

  if (context.mode === "stock") {
    if (!canAccessSection(context.role, "stock", context.permissions)) {
      return getRestrictedReply("estoque");
    }

    return "No modo Estoque, comece olhando os itens abaixo do mínimo. Depois lance entradas ou ajustes, revise o estoque mínimo dos insumos importantes e acompanhe se as vendas estão baixando tudo corretamente.";
  }

  if (context.mode === "sales") {
    if (
      !canAccessSection(context.role, "budgets", context.permissions) &&
      !canAccessSection(context.role, "customers", context.permissions)
    ) {
      return getRestrictedReply("clientes, orçamentos e vendas");
    }

    return "No modo Vendas, comece pelos orçamentos em aberto. Depois veja clientes com oportunidade, acompanhe vendas recentes e converta orçamentos aprovados quando seu perfil permitir.";
  }

  if (normalizeRole(context.role) === "seller") {
    return "Para vendedor, o melhor começo é consultar produtos, cadastrar clientes e criar orçamentos. Quando precisar de estoque, vendas finalizadas ou configurações, chame um administrador ou funcionário.";
  }

  return "Comece cadastrando os insumos, depois monte os produtos, cadastre clientes e então crie orçamentos. Quando um orçamento for aprovado, converta em venda para baixar estoque automaticamente.";
}

function formatLocalAlertSummary(context: ReplyContext) {
  const alerts = getProactiveAlerts(context);

  if (alerts.length > 0) {
    return alerts.map((alert) => `${alert.title}: ${alert.detail}`).join("\n");
  }

  if (context.dashboard && !context.dashboardError) {
    const metrics = context.dashboard.metrics;

    return [
      "Não encontrei alerta crítico agora.",
      `Resumo rápido: ${currencyFormatter.format(
        metrics.revenue
      )} em faturamento, ${metrics.salesCount} venda(s), ${metrics.openBudgetCount} orçamento(s) em aberto e ${metrics.lowStockCount} insumo(s) em estoque baixo.`
    ].join("\n");
  }

  return "Ainda estou carregando os dados principais. Enquanto isso, posso te orientar sobre cadastros, estoque, produtos, clientes, orçamentos e vendas.";
}

function getLocalPromptSuggestions(activeItem: string, context: ReplyContext) {
  return getVisibleQuickPrompts(
    activeItem,
    context.role,
    context.permissions,
    context.mode
  )
    .slice(0, 3)
    .map((prompt) => prompt.prompt);
}

function formatLocalSuggestionList(suggestions: string[]) {
  if (suggestions.length === 0) {
    return null;
  }

  return `Você pode me perguntar, por exemplo:\n${suggestions
    .map((suggestion) => `- ${suggestion}`)
    .join("\n")}`;
}

function formatBasicAssistantReply(
  prompt: string,
  context: ReplyContext,
  activeItem: string
) {
  const normalized = normalizePrompt(prompt);
  const suggestions = getLocalPromptSuggestions(activeItem, context);
  const suggestionText = formatLocalSuggestionList(suggestions);
  const pageTip = pageTips[activeItem];

  if (
    hasAnyTerm(normalized, [
      "bom dia",
      "boa tarde",
      "boa noite",
      "e ai",
      "fala",
      "hey",
      "ola",
      "oi"
    ])
  ) {
    return [
      "Olá! Eu sou o Carbon, seu assistente virtual do Carbon Flow.",
      "Consigo te ajudar no modo básico com navegação, primeiros passos, estoque, produtos, clientes, orçamentos, vendas e leitura dos dados já carregados no sistema.",
      suggestionText
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (
    hasAnyTerm(normalized, [
      "o que voce faz",
      "oque voce faz",
      "como voce ajuda",
      "me ajuda",
      "ajuda",
      "comandos",
      "opcoes"
    ])
  ) {
    return [
      "Posso te ajudar a encontrar telas, explicar fluxos e resumir dados do Carbon Flow.",
      "Também consigo apontar estoque baixo, orçamentos pendentes, clientes com oportunidade e vendas recentes quando esses dados estiverem carregados para o seu perfil.",
      suggestionText
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (
    hasAnyTerm(normalized, [
      "alerta",
      "atenção",
      "atencao",
      "critico",
      "crítico",
      "prioridade",
      "prioridades",
      "recomendacao",
      "recomendação",
      "recomenda",
      "o que fazer agora",
      "proximo passo",
      "próximo passo"
    ])
  ) {
    return formatLocalAlertSummary(context);
  }

  return [
    "Consigo responder essa parte pelo modo básico do Carbon.",
    pageTip ? `Nesta tela: ${pageTip}` : null,
    formatLocalAlertSummary(context),
    suggestionText
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getAssistantReply(
  prompt: string,
  context: ReplyContext
): string | null {
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
    normalized.includes("orcamento pendente") ||
    normalized.includes("orcamentos pendentes") ||
    normalized.includes("orcamento em aberto") ||
    normalized.includes("orcamentos em aberto") ||
    (normalized.includes("orcamento") && normalized.includes("aprovado"))
  ) {
    return formatPendingBudgetsReply(context);
  }

  if (
    normalized.includes("cliente mais compr") ||
    normalized.includes("clientes mais compr") ||
    normalized.includes("cliente gastou mais") ||
    normalized.includes("clientes gastaram mais") ||
    normalized.includes("top clientes")
  ) {
    return formatTopCustomersReply(context);
  }

  if (
    normalized.includes("vendas recentes") ||
    normalized.includes("venda recente") ||
    normalized.includes("quem comprou recentemente") ||
    normalized.includes("comprou recentemente")
  ) {
    return formatRecentSalesReply(context);
  }

  if (
    normalized.includes("cliente sem venda") ||
    normalized.includes("clientes sem venda") ||
    normalized.includes("cliente sem contato") ||
    normalized.includes("clientes sem contato") ||
    normalized.includes("oportunidade")
  ) {
    return formatCustomerOpportunitiesReply(context);
  }

  if (
    normalized.includes("estoque minimo") ||
    normalized.includes("ponto de reposicao") ||
    normalized.includes("quando repor")
  ) {
    if (!canAccessSection(context.role, "ingredients", context.permissions)) {
      return getRestrictedReply("o cadastro de insumos e estoque mínimo");
    }

    return "Use o estoque mínimo como ponto de alerta para reposição. Uma boa regra inicial é colocar o mínimo suficiente para cobrir o tempo entre comprar o insumo e ele chegar, considerando sua média de uso.";
  }

  if (
    normalized.includes("preco") ||
    normalized.includes("margem") ||
    normalized.includes("precificacao")
  ) {
    if (!canAccessSection(context.role, "products", context.permissions)) {
      return getRestrictedReply("produtos e precificação");
    }

    return "Em Produtos, o Carbon Flow soma o custo dos insumos da composição e sugere preço com margem inicial de 30%. Você pode ajustar a margem ou informar um preço manual quando quiser.";
  }

  if (
    normalized.includes("historico") &&
    (normalized.includes("cliente") || normalized.includes("compras"))
  ) {
    if (!canAccessSection(context.role, "customers", context.permissions)) {
      return getRestrictedReply("clientes");
    }

    return "Em Clientes, cada cadastro concentra dados de contato e histórico comercial. Isso ajuda a ver orçamentos, vendas e valores gastos por cliente.";
  }

  if (normalized.includes("comeco") || normalized.includes("primeiro")) {
    return formatModeFirstStepsReply(context);
  }

  if (normalized.includes("insumo") || normalized.includes("materia")) {
    if (!canAccessSection(context.role, "ingredients", context.permissions)) {
      return getRestrictedReply("insumos");
    }

    return "Para cadastrar um insumo, vá em Insumos, clique em Novo insumo e informe nome, unidade, custo unitário, estoque atual e estoque mínimo. Esse custo será usado no cálculo dos produtos.";
  }

  if (normalized.includes("produto") || normalized.includes("composicao")) {
    if (!canAccessSection(context.role, "products", context.permissions)) {
      return getRestrictedReply("produtos");
    }

    if (
      (normalized.includes("criar") ||
        normalized.includes("cadastrar") ||
        normalized.includes("montar")) &&
      !canManageProducts(context.role, context.permissions)
    ) {
      return "Seu perfil pode consultar produtos, mas criar ou editar produtos fica para administradores e funcionários.";
    }

    return "Para criar um produto, vá em Produtos, clique em Novo produto e adicione os insumos da composição. O Carbon Flow calcula o custo e sugere o preço com base na margem.";
  }

  if (normalized.includes("estoque") || normalized.includes("baixa")) {
    if (!canAccessSection(context.role, "stock", context.permissions)) {
      return getRestrictedReply("estoque");
    }

    return "O estoque baixa automaticamente quando uma venda é criada a partir de produtos com composição. Também dá para acompanhar entradas, saídas e ajustes na tela Estoque.";
  }

  if (normalized.includes("orcamento") || normalized.includes("proposta")) {
    if (!canAccessSection(context.role, "budgets", context.permissions)) {
      return getRestrictedReply("orçamentos");
    }

    if (
      (normalized.includes("converter") || normalized.includes("venda")) &&
      !canConvertBudgets(context.role, context.permissions)
    ) {
      return "Seu perfil pode trabalhar com orçamentos, mas converter orçamento em venda e baixar estoque fica para administradores e funcionários.";
    }

    return "Em Orçamentos você seleciona cliente, produtos, quantidades, validade e observações. Depois pode imprimir ou abrir o documento profissional do orçamento.";
  }

  if (normalized.includes("venda") || normalized.includes("converter")) {
    if (
      normalized.includes("converter") &&
      !canConvertBudgets(context.role, context.permissions)
    ) {
      return "Seu perfil pode trabalhar com orçamentos, mas converter orçamento em venda e baixar estoque fica para administradores e funcionários.";
    }

    if (!canAccessSection(context.role, "sales", context.permissions)) {
      return getRestrictedReply("vendas");
    }

    return "Quando o cliente aprovar, use Converter em venda no orçamento. O sistema cria a venda, registra os itens e baixa os insumos do estoque.";
  }

  if (normalized.includes("cliente")) {
    if (!canAccessSection(context.role, "customers", context.permissions)) {
      return getRestrictedReply("clientes");
    }

    return "Em Clientes você cadastra nome, telefone, e-mail, endereço e observações. O histórico ajuda a acompanhar orçamentos, vendas e valores gastos.";
  }

  if (
    normalized.includes("usuario") ||
    normalized.includes("convite") ||
    normalized.includes("permiss")
  ) {
    if (!canAccessSection(context.role, "settings", context.permissions)) {
      return getRestrictedReply("configurações e permissões");
    }

    return "Em Configurações você gerencia usuários, convites e permissões. Administradores têm acesso total; vendedores e funcionários podem ter acesso limitado.";
  }

  if (normalized.includes("plano") || normalized.includes("assinatura")) {
    if (!canAccessSection(context.role, "billing", context.permissions)) {
      return getRestrictedReply("planos e assinatura");
    }

    return "Em Planos você acompanha os limites do plano atual e deixa a estrutura pronta para assinaturas futuras.";
  }

  if (normalized.includes("tema") || normalized.includes("cor")) {
    return "Você pode trocar a aparência pelo seletor de tema. A escolha fica salva no navegador para os próximos acessos.";
  }

  return null;
}

export function VirtualAssistant({
  activeItem,
  companyId,
  permissions,
  role,
  userEmail
}: VirtualAssistantProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [budgets, setBudgets] = useState<AssistantBudget[]>([]);
  const [budgetsError, setBudgetsError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<AssistantCustomer[]>([]);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [sales, setSales] = useState<AssistantSale[]>([]);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isBudgetsLoading, setIsBudgetsLoading] = useState(true);
  const [isCustomersLoading, setIsCustomersLoading] = useState(true);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [loadedConversationKey, setLoadedConversationKey] = useState<
    string | null
  >(null);
  const [loadedPreferencesKey, setLoadedPreferencesKey] = useState<
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
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("general");
  const conversationStorageKey = useMemo(
    () => getConversationStorageKey(companyId, userEmail),
    [companyId, userEmail]
  );
  const preferencesStorageKey = useMemo(
    () => getPreferencesStorageKey(companyId, userEmail),
    [companyId, userEmail]
  );
  const canReadBudgets = canAccessSection(role, "budgets", permissions);
  const canReadCustomers = canAccessSection(role, "customers", permissions);
  const canReadDashboard = canAccessSection(role, "dashboard", permissions);
  const canReadSales = canAccessSection(role, "sales", permissions);
  const avatarSrc = assistantAvatarByTheme[theme] ?? fallbackAssistantAvatar;
  const assistantStatus = getAssistantStatus({
    canReadDashboard,
    dashboardError,
    isDashboardLoading
  });
  const availableAssistantModes = getAvailableAssistantModes(role, permissions);
  const visibleNavigationLinks = getVisibleNavigationLinks(role, permissions);
  const visibleQuickActions = getVisibleQuickActions(
    activeItem,
    role,
    permissions
  );
  const visibleQuickPrompts = getVisibleQuickPrompts(
    activeItem,
    role,
    permissions,
    assistantMode
  );
  const assistantContext = useMemo<ReplyContext>(
    () => ({
      budgets,
      budgetsError,
      customers,
      customersError,
      dashboard,
      dashboardError,
      isBudgetsLoading,
      isCustomersLoading,
      isDashboardLoading,
      isSalesLoading,
      mode: assistantMode,
      permissions,
      role,
      sales,
      salesError
    }),
    [
      budgets,
      budgetsError,
      customers,
      customersError,
      dashboard,
      dashboardError,
      isBudgetsLoading,
      isCustomersLoading,
      isDashboardLoading,
      isSalesLoading,
      assistantMode,
      permissions,
      role,
      sales,
      salesError
    ]
  );
  const allProactiveAlerts = useMemo(
    () => getProactiveAlerts(assistantContext),
    [assistantContext]
  );
  const proactiveAlerts = useMemo(
    () =>
      allProactiveAlerts.filter(
        (alert) => !dismissedAlertIds.includes(alert.id)
      ),
    [allProactiveAlerts, dismissedAlertIds]
  );
  const hasWarningAlert = proactiveAlerts.some(
    (alert) => alert.severity === "warning"
  );
  const hiddenProactiveAlertCount =
    allProactiveAlerts.length - proactiveAlerts.length;

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
    if (!canUseAssistantMode(assistantMode, role, permissions)) {
      setAssistantMode("general");
    }
  }, [assistantMode, permissions, role]);

  useEffect(() => {
    setLoadedPreferencesKey(null);

    const storedPreferences = readStoredAssistantPreferences(
      preferencesStorageKey
    );
    const storedMode = storedPreferences?.mode ?? "general";

    setAssistantMode(
      canUseAssistantMode(storedMode, role, permissions)
        ? storedMode
        : "general"
    );
    setDismissedAlertIds(storedPreferences?.dismissedAlertIds ?? []);
    setLoadedPreferencesKey(preferencesStorageKey);
  }, [permissions, preferencesStorageKey, role]);

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
    if (loadedPreferencesKey !== preferencesStorageKey) {
      return;
    }

    writeStoredAssistantPreferences(preferencesStorageKey, {
      dismissedAlertIds,
      mode: assistantMode
    });
  }, [
    assistantMode,
    dismissedAlertIds,
    loadedPreferencesKey,
    preferencesStorageKey
  ]);

  useEffect(() => {
    let isActive = true;

    async function loadBudgets() {
      if (!canReadBudgets) {
        setBudgets([]);
        setBudgetsError(null);
        setIsBudgetsLoading(false);
        return;
      }

      setIsBudgetsLoading(true);
      setBudgetsError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("Sessão expirada. Entre novamente.");
        }

        const response = await fetch(`${env.apiUrl}/budgets`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            "x-company-id": companyId
          }
        });
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            getApiMessage(payload, "Não foi possível carregar os orçamentos.")
          );
        }

        if (isActive) {
          setBudgets(payload as AssistantBudget[]);
        }
      } catch (error) {
        if (isActive) {
          setBudgets([]);
          setBudgetsError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os orçamentos."
          );
        }
      } finally {
        if (isActive) {
          setIsBudgetsLoading(false);
        }
      }
    }

    void loadBudgets();

    return () => {
      isActive = false;
    };
  }, [canReadBudgets, companyId]);

  useEffect(() => {
    let isActive = true;

    async function loadCustomers() {
      if (!canReadCustomers) {
        setCustomers([]);
        setCustomersError(null);
        setIsCustomersLoading(false);
        return;
      }

      setIsCustomersLoading(true);
      setCustomersError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("Sessão expirada. Entre novamente.");
        }

        const response = await fetch(`${env.apiUrl}/customers`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            "x-company-id": companyId
          }
        });
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            getApiMessage(payload, "Não foi possível carregar os clientes.")
          );
        }

        if (isActive) {
          setCustomers(payload as AssistantCustomer[]);
        }
      } catch (error) {
        if (isActive) {
          setCustomers([]);
          setCustomersError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os clientes."
          );
        }
      } finally {
        if (isActive) {
          setIsCustomersLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      isActive = false;
    };
  }, [canReadCustomers, companyId]);

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

  useEffect(() => {
    let isActive = true;

    async function loadSales() {
      if (!canReadSales) {
        setSales([]);
        setSalesError(null);
        setIsSalesLoading(false);
        return;
      }

      setIsSalesLoading(true);
      setSalesError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("Sessão expirada. Entre novamente.");
        }

        const response = await fetch(`${env.apiUrl}/sales`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            "x-company-id": companyId
          }
        });
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            getApiMessage(payload, "Não foi possível carregar as vendas.")
          );
        }

        if (isActive) {
          setSales(payload as AssistantSale[]);
        }
      } catch (error) {
        if (isActive) {
          setSales([]);
          setSalesError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as vendas."
          );
        }
      } finally {
        if (isActive) {
          setIsSalesLoading(false);
        }
      }
    }

    void loadSales();

    return () => {
      isActive = false;
    };
  }, [canReadSales, companyId]);

  async function requestAiReply(prompt: string) {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("Sessão expirada. Entre novamente.");
    }

    const response = await fetch(`${env.apiUrl}/assistant/chat`, {
      body: JSON.stringify({
        activeItem,
        mode: assistantMode,
        prompt
      }),
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId
      },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      AssistantChatResponse | { message?: string | string[] } | null;

    if (!response.ok || !payload || !("answer" in payload)) {
      throw new Error(
        getApiMessage(payload, "Não foi possível acionar a IA do Carbon.")
      );
    }

    return payload;
  }

  async function sendPrompt(prompt: string) {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      return;
    }

    if (isAiThinking) {
      return;
    }

    const requestedMode = getRequestedAssistantMode(cleanPrompt);

    if (requestedMode) {
      if (!canUseAssistantMode(requestedMode, role, permissions)) {
        setMessages((current) =>
          limitConversation([
            ...current,
            { author: "user", text: cleanPrompt },
            {
              author: "assistant",
              text: `Seu perfil atual não tem acesso ao modo ${getAssistantModeLabel(
                requestedMode
              )}. Se isso for necessário para o seu trabalho, peça para um administrador ajustar suas permissões.`
            }
          ])
        );
        setInput("");
        return;
      }

      setAssistantMode(requestedMode);
      setMessages((current) =>
        limitConversation([
          ...current,
          { author: "user", text: cleanPrompt },
          {
            author: "assistant",
            text: getAssistantModeIntro(requestedMode)
          }
        ])
      );
      setInput("");
      return;
    }

    const directAction = getDirectQuickAction(cleanPrompt);

    if (directAction) {
      runQuickAction(directAction, cleanPrompt);
      setInput("");
      return;
    }

    const localReply = getAssistantReply(cleanPrompt, assistantContext);

    if (localReply) {
      setMessages((current) =>
        limitConversation([
          ...current,
          { author: "user", text: cleanPrompt },
          {
            author: "assistant",
            text: localReply
          }
        ])
      );
      setInput("");
      return;
    }

    if (!env.assistantAiEnabled) {
      setMessages((current) =>
        limitConversation([
          ...current,
          { author: "user", text: cleanPrompt },
          {
            author: "assistant",
            text: formatBasicAssistantReply(
              cleanPrompt,
              assistantContext,
              activeItem
            )
          }
        ])
      );
      setInput("");
      return;
    }

    setMessages((current) =>
      limitConversation([...current, { author: "user", text: cleanPrompt }])
    );
    setInput("");
    setIsAiThinking(true);

    try {
      const aiReply = await requestAiReply(cleanPrompt);
      const replyText =
        aiReply.source === "ai"
          ? aiReply.answer
          : formatBasicAssistantReply(
              cleanPrompt,
              assistantContext,
              activeItem
            );

      setMessages((current) =>
        limitConversation([
          ...current,
          {
            author: "assistant",
            text: replyText
          }
        ])
      );
    } catch (error) {
      const fallbackReply = formatBasicAssistantReply(
        cleanPrompt,
        assistantContext,
        activeItem
      );

      setMessages((current) =>
        limitConversation([
          ...current,
          {
            author: "assistant",
            text:
              error instanceof Error &&
              error.message.includes("Sessão expirada")
                ? error.message
                : fallbackReply
          }
        ])
      );
    } finally {
      setIsAiThinking(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(input);
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

  function dismissProactiveAlert(alertId: string) {
    setDismissedAlertIds((current) =>
      current.includes(alertId) ? current : [...current, alertId].slice(-20)
    );
  }

  function restoreCurrentProactiveAlerts() {
    const currentAlertIds = new Set(
      allProactiveAlerts.map((alert) => alert.id)
    );

    setDismissedAlertIds((current) =>
      current.filter((alertId) => !currentAlertIds.has(alertId))
    );
  }

  function runQuickAction(action: QuickAction, userText = action.label) {
    if (!canUseQuickAction(action, role, permissions)) {
      setMessages((current) =>
        limitConversation([
          ...current,
          { author: "user", text: userText },
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
        { author: "user", text: userText },
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
    <div className="fixed inset-x-2 bottom-2 z-40 flex flex-col items-end justify-end sm:inset-x-auto sm:bottom-2 sm:right-2 md:bottom-3 md:right-3 xl:bottom-6 xl:right-6">
      {isOpen ? (
        <section className="flex h-[min(44rem,calc(100dvh-5.75rem))] max-h-[calc(100dvh-5.75rem)] w-full flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] shadow-2xl shadow-[color:var(--shadow-color)] sm:h-[min(46rem,calc(100vh-7rem))] sm:max-h-[calc(100vh-7rem)] sm:w-[27rem] md:h-[min(48rem,calc(100vh-8rem))] md:max-h-[calc(100vh-8rem)] md:w-[30rem] lg:w-[32rem] xl:h-[min(52rem,calc(100vh-8rem))] xl:max-h-[calc(100vh-8rem)] xl:w-[34rem]">
          <header className="flex items-start justify-between gap-2 border-b border-[var(--border)] p-3 sm:items-center sm:gap-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <AssistantAvatar
                className="h-10 w-10 shrink-0 sm:h-12 sm:w-12"
                sizes="(min-width: 640px) 48px, 40px"
                src={avatarSrc}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  Carbon
                </p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  Seu assistente virtual do Carbon Flow
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-[var(--muted-foreground)] sm:text-[11px]">
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

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                aria-label="Limpar conversa do Carbon"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] sm:h-9 sm:w-9"
                onClick={clearConversation}
                title="Limpar conversa"
                type="button"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                aria-label="Fechar Carbon"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] sm:h-9 sm:w-9"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="shrink-0 border-b border-[var(--border)] p-2.5 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--muted-foreground)]">
                Modo
              </p>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {getAssistantModeLabel(assistantMode)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {availableAssistantModes.map((mode) => {
                const isActiveMode = assistantMode === mode.id;

                return (
                  <button
                    className={[
                      "flex min-h-8 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[11px] transition sm:min-h-9 sm:gap-1.5 sm:px-2 sm:text-xs",
                      isActiveMode
                        ? "border-[var(--primary)] bg-[var(--primary-active)] text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                    ].join(" ")}
                    key={mode.id}
                    onClick={() => {
                      setAssistantMode(mode.id);
                      setMessages((current) =>
                        limitConversation([
                          ...current,
                          {
                            author: "assistant",
                            text: getAssistantModeIntro(mode.id)
                          }
                        ])
                      );
                    }}
                    type="button"
                  >
                    <mode.icon
                      className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5"
                      aria-hidden="true"
                    />
                    <span className="truncate">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {proactiveAlerts.length || hiddenProactiveAlertCount > 0 ? (
            <div className="shrink-0 border-b border-[var(--border)] p-2.5 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--muted-foreground)]">
                  Atenção agora
                </p>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {proactiveAlerts.length
                    ? `${proactiveAlerts.length} ponto(s)`
                    : `${hiddenProactiveAlertCount} oculto(s)`}
                </span>
              </div>

              {proactiveAlerts.length ? (
                <div className="max-h-32 space-y-2 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
                  {proactiveAlerts.map((alert) => {
                    const tone = getProactiveAlertClasses(alert.severity);

                    return (
                      <article
                        className={[
                          "flex w-full min-w-0 items-start gap-2 rounded-md border p-2.5 text-left transition sm:gap-3 sm:p-3",
                          tone.panel
                        ].join(" ")}
                        key={alert.id}
                      >
                        <span
                          className={[
                            "mt-1 h-2 w-2 shrink-0 rounded-full",
                            tone.dot
                          ].join(" ")}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={[
                              "block text-xs font-semibold",
                              tone.title
                            ].join(" ")}
                          >
                            {alert.title}
                          </span>
                          <span className="mt-1 block break-words text-xs leading-5 text-[var(--muted-foreground)]">
                            {alert.detail}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                          <button
                            className="rounded-md bg-[var(--surface-soft)] px-2 py-1 text-[11px] text-[var(--foreground)] transition hover:bg-[var(--secondary)]"
                            onClick={() => runQuickAction(alert.action)}
                            type="button"
                          >
                            Abrir
                          </button>
                          <button
                            aria-label={`Dispensar alerta: ${alert.title}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                            onClick={() => dismissProactiveAlert(alert.id)}
                            title="Dispensar"
                            type="button"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      </article>
                    );
                  })}
                </div>
              ) : null}

              {hiddenProactiveAlertCount > 0 ? (
                <button
                  className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                  onClick={restoreCurrentProactiveAlerts}
                  type="button"
                >
                  Reexibir alertas dispensados
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:space-y-3 sm:p-4">
            {messages.map((message, index) => (
              <div
                className={[
                  "whitespace-pre-line rounded-md px-3 py-2 text-sm leading-6",
                  message.author === "assistant"
                    ? "mr-4 bg-[var(--surface-soft)] text-[var(--muted-foreground)] sm:mr-8"
                    : "ml-4 bg-[var(--primary-active)] text-[var(--foreground)] sm:ml-8"
                ].join(" ")}
                key={`${message.author}-${index}`}
              >
                {message.text}
              </div>
            ))}
            {isAiThinking ? (
              <div className="mr-4 rounded-md bg-[var(--surface-soft)] px-3 py-2 text-sm leading-6 text-[var(--muted-foreground)] sm:mr-8">
                Carbon está pensando...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="max-h-[42dvh] shrink-0 overflow-y-auto overscroll-contain border-t border-[var(--border)] p-2.5 sm:max-h-none sm:overflow-visible sm:p-4">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-normal text-[var(--muted-foreground)] sm:mb-2 sm:text-[11px]">
              Ações rápidas
            </p>
            <div className="mb-2 grid grid-cols-3 gap-1.5 sm:mb-3 sm:grid-cols-2 sm:gap-2">
              {visibleQuickActions.map((item) => (
                <button
                  className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md border border-[var(--primary)] bg-[var(--primary-active)] px-1.5 text-center text-[11px] text-[var(--foreground)] transition hover:bg-[var(--secondary)] sm:min-h-10 sm:justify-start sm:gap-2 sm:px-2 sm:text-left sm:text-xs"
                  key={item.label}
                  onClick={() => runQuickAction(item)}
                  type="button"
                >
                  <item.icon
                    className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>

            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-normal text-[var(--muted-foreground)] sm:mb-2 sm:text-[11px]">
              Perguntas úteis
            </p>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:mb-3 sm:gap-2">
              {visibleQuickPrompts.map((item) => (
                <button
                  className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 text-left text-[11px] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] sm:min-h-10 sm:gap-2 sm:px-2 sm:text-xs"
                  disabled={isAiThinking}
                  key={item.label}
                  onClick={() => void sendPrompt(item.prompt)}
                  type="button"
                >
                  <item.icon
                    className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>

            {visibleNavigationLinks.length ? (
              <>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-normal text-[var(--muted-foreground)] sm:mb-2 sm:text-[11px]">
                  Navegação
                </p>
                <div className="mb-2 flex flex-wrap gap-1.5 sm:mb-3 sm:gap-2">
                  {visibleNavigationLinks.map((item) => (
                    <Link
                      className="rounded-md bg-[var(--surface-soft)] px-2 py-1 text-[11px] text-[var(--primary)] transition hover:bg-[var(--secondary)] sm:text-xs"
                      href={item.href}
                      key={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </>
            ) : null}

            <form
              className="sticky bottom-0 flex gap-2 bg-[var(--panel-strong)] pt-1"
              onSubmit={handleSubmit}
            >
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                disabled={isAiThinking}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  isAiThinking ? "Carbon está pensando..." : "Pergunte algo..."
                }
                value={input}
              />
              <Button disabled={isAiThinking} size="icon" type="submit">
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </section>
      ) : null}

      {!isOpen ? (
        <button
          aria-label="Abrir Carbon, assistente virtual do Carbon Flow"
          className="relative ml-auto flex h-16 w-16 items-center justify-center rounded-full bg-transparent transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 xl:h-60 xl:w-60"
          onClick={() => {
            setMessages((current) =>
              current.length ? current : [introMessage]
            );
            setIsOpen(true);
          }}
          type="button"
        >
          {proactiveAlerts.length ? (
            <span
              className={[
                "absolute right-0 top-0 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow-lg sm:right-2 sm:top-2 sm:h-6 sm:min-w-6 sm:text-xs md:right-3 md:top-3 xl:right-8 xl:top-8",
                hasWarningAlert
                  ? "bg-[rgb(245_158_11)] text-black"
                  : "bg-[var(--primary)] text-[var(--background)]"
              ].join(" ")}
            >
              {proactiveAlerts.length}
            </span>
          ) : null}
          <AssistantAvatar
            className="h-14 w-14 sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28 xl:h-[13.5rem] xl:w-[13.5rem]"
            sizes="(min-width: 1280px) 216px, (min-width: 1024px) 112px, (min-width: 768px) 96px, (min-width: 640px) 80px, 72px"
            src={avatarSrc}
          />
        </button>
      ) : null}
    </div>
  );
}
