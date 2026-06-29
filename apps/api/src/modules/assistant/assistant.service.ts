import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type CurrentCompany } from "../../common/decorators/current-company.decorator";
import { type CurrentUser } from "../../common/decorators/current-user.decorator";
import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { AssistantChatDto } from "./dto/assistant-chat.dto";

type CompanyRole = "admin" | "employee" | "seller";

type OpenAiResponsePayload = {
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  output_text?: string;
};

type CustomerJoin = {
  name: string;
};

type JoinedCustomerRow = {
  customers?: CustomerJoin | CustomerJoin[] | null;
};

function isCompanyRole(role: string): role is CompanyRole {
  return role === "admin" || role === "employee" || role === "seller";
}

function canReadCosts(role: CompanyRole) {
  return role === "admin" || role === "employee";
}

function canReadSales(role: CompanyRole) {
  return role === "admin" || role === "employee";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getMonthStart() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getNextMonthStart() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function getJoinedCustomerName(row: JoinedCustomerRow) {
  if (Array.isArray(row.customers)) {
    return row.customers[0]?.name ?? null;
  }

  return row.customers?.name ?? null;
}

function getOpenAiText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .trim();

  return text || null;
}

function getApiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Falha ao carregar contexto.";
}

function getOpenAiFailureMessage(
  payload: OpenAiResponsePayload | null,
  status: number
) {
  const message = payload?.error?.message ?? "";
  const normalizedMessage = message.toLowerCase();
  const errorCode = payload?.error?.code;
  const errorType = payload?.error?.type;

  if (
    status === 429 &&
    (errorCode === "insufficient_quota" ||
      errorType === "insufficient_quota" ||
      normalizedMessage.includes("exceeded your current quota") ||
      normalizedMessage.includes("billing"))
  ) {
    return "A IA do Carbon está configurada, mas a conta da OpenAI está sem cota ou sem créditos ativos. Verifique o billing/créditos da OpenAI e tente novamente.";
  }

  if (status === 401) {
    return "A chave da OpenAI configurada na API não foi aceita. Gere uma nova chave, atualize OPENAI_API_KEY na Vercel da API e faça redeploy.";
  }

  if (status === 429) {
    return "A IA do Carbon atingiu um limite temporário de uso. Tente novamente em alguns instantes.";
  }

  return (
    message ||
    "Não consegui acionar a IA do Carbon agora. Tente novamente em instantes."
  );
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseFactory: SupabaseClientFactory
  ) {}

  async chat(
    accessToken: string,
    company: CurrentCompany,
    user: CurrentUser,
    dto: AssistantChatDto
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    const model = this.config.get<string>("OPENAI_MODEL", "gpt-5.5");
    const role = isCompanyRole(company.role) ? company.role : "seller";

    if (!apiKey) {
      return {
        answer:
          "A IA do Carbon ainda não está configurada. Adicione OPENAI_API_KEY na API para ativar respostas inteligentes.",
        source: "not_configured" as const
      };
    }

    const context = await this.buildContext(accessToken, company.id, role, dto);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: this.buildUserInput(dto, company, user, context),
        instructions: this.buildInstructions(role),
        max_output_tokens: 700,
        model,
        reasoning: {
          effort: "low"
        },
        text: {
          verbosity: "low"
        }
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | OpenAiResponsePayload
      | null;

    if (!response.ok || !payload) {
      return {
        answer: getOpenAiFailureMessage(payload, response.status),
        model,
        source: "fallback" as const
      };
    }

    return {
      answer:
        getOpenAiText(payload) ??
        "A IA respondeu sem texto útil. Tente reformular a pergunta.",
      model,
      source: "ai" as const
    };
  }

  private buildInstructions(role: CompanyRole) {
    return [
      "Você é Carbon, o assistente virtual do Carbon Flow.",
      "Responda em português do Brasil, com tom profissional, simples e direto.",
      "Ajude pequenos fabricantes a entender produção, custos, estoque, clientes, orçamentos e vendas.",
      "Use somente o contexto fornecido. Se o dado não estiver no contexto, diga que ainda não tem esse dado carregado.",
      "Não invente números, clientes, produtos, custos, vendas ou permissões.",
      "Não solicite nem exponha chaves, tokens, senhas ou dados sensíveis.",
      "Se a resposta depender de uma ação no sistema, explique o caminho mais curto.",
      `Perfil atual do usuário: ${role}. Respeite as limitações desse perfil.`
    ].join("\n");
  }

  private buildUserInput(
    dto: AssistantChatDto,
    company: CurrentCompany,
    user: CurrentUser,
    context: Record<string, unknown>
  ) {
    return [
      `Pergunta do usuário: ${dto.prompt}`,
      `Tela atual: ${dto.activeItem ?? "não informada"}`,
      `Modo do Carbon: ${dto.mode ?? "general"}`,
      `Empresa: ${company.id}`,
      `Usuário: ${user.email ?? user.id}`,
      "Contexto seguro disponível:",
      JSON.stringify(context, null, 2)
    ].join("\n\n");
  }

  private async buildContext(
    accessToken: string,
    companyId: string,
    role: CompanyRole,
    dto: AssistantChatDto
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const safe = async <T>(loader: () => Promise<T>) => {
      try {
        return await loader();
      } catch (error) {
        return { error: getApiErrorMessage(error) };
      }
    };

    const [dashboard, products, ingredients, budgets, customers, sales] =
      await Promise.all([
        canReadSales(role)
          ? safe(() => this.loadDashboardContext(supabase, companyId))
          : Promise.resolve({ skipped: "Perfil sem acesso ao dashboard." }),
        safe(() => this.loadProductsContext(supabase, companyId, role)),
        canReadCosts(role)
          ? safe(() => this.loadIngredientsContext(supabase, companyId))
          : Promise.resolve({ skipped: "Perfil sem acesso a custos e estoque." }),
        safe(() => this.loadBudgetsContext(supabase, companyId)),
        safe(() => this.loadCustomersContext(supabase, companyId)),
        canReadSales(role)
          ? safe(() => this.loadSalesContext(supabase, companyId))
          : Promise.resolve({ skipped: "Perfil sem acesso a vendas finalizadas." })
      ]);

    return {
      activePage: dto.activeItem ?? null,
      budgets,
      customers,
      dashboard,
      ingredients,
      mode: dto.mode ?? "general",
      products,
      role,
      sales
    };
  }

  private async loadDashboardContext(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string
  ) {
    const periodStart = getMonthStart();
    const periodEnd = getNextMonthStart();
    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("id, total_amount, estimated_profit, status, sold_at")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("sold_at", periodStart.toISOString())
      .lt("sold_at", periodEnd.toISOString());

    if (salesError) {
      throw salesError;
    }

    const saleRows = (sales ?? []) as Array<{
      estimated_profit: string;
      total_amount: string;
    }>;
    const revenue = roundMoney(
      saleRows.reduce((total, sale) => total + Number(sale.total_amount), 0)
    );
    const estimatedProfit = roundMoney(
      saleRows.reduce(
        (total, sale) => total + Number(sale.estimated_profit),
        0
      )
    );
    const { data: openBudgets, error: budgetsError } = await supabase
      .from("budgets")
      .select("id, total_amount, status")
      .eq("company_id", companyId)
      .in("status", ["draft", "sent", "approved"]);

    if (budgetsError) {
      throw budgetsError;
    }

    const openBudgetRows = (openBudgets ?? []) as Array<{
      total_amount: string;
    }>;

    return {
      estimatedProfit,
      openBudgetAmount: roundMoney(
        openBudgetRows.reduce(
          (total, budget) => total + Number(budget.total_amount),
          0
        )
      ),
      openBudgetCount: openBudgetRows.length,
      period: "Mês atual",
      revenue,
      salesCount: saleRows.length
    };
  }

  private async loadProductsContext(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string,
    role: CompanyRole
  ) {
    const includeCosts = canReadCosts(role);
    const selectColumns = includeCosts
      ? "name,sale_price,estimated_cost,suggested_price,margin_percent"
      : "name,sale_price";
    const { data, error } = await supabase
      .from("products")
      .select(selectColumns)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(8);

    if (error) {
      throw error;
    }

    return ((data ?? []) as unknown[]).map((product) => {
      const row = product as Record<string, string>;

      return includeCosts
        ? {
            cost: Number(row.estimated_cost),
            marginPercent: Number(row.margin_percent),
            name: row.name,
            salePrice: Number(row.sale_price),
            suggestedPrice: Number(row.suggested_price)
          }
        : {
            name: row.name,
            salePrice: Number(row.sale_price)
          };
    });
  }

  private async loadIngredientsContext(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string
  ) {
    const { data, error } = await supabase
      .from("ingredients")
      .select("name, inventory_unit, stock_quantity, minimum_stock, unit_cost")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    const ingredients = (data ?? []) as Array<{
      inventory_unit: string;
      minimum_stock: string;
      name: string;
      stock_quantity: string;
      unit_cost: string;
    }>;

    return {
      lowStock: ingredients
        .filter(
          (ingredient) =>
            Number(ingredient.stock_quantity) <=
            Number(ingredient.minimum_stock)
        )
        .slice(0, 8)
        .map((ingredient) => ({
          current: Number(ingredient.stock_quantity),
          minimum: Number(ingredient.minimum_stock),
          name: ingredient.name,
          unit: ingredient.inventory_unit,
          unitCost: Number(ingredient.unit_cost)
        })),
      totalActive: ingredients.length
    };
  }

  private async loadBudgetsContext(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string
  ) {
    const { data, error } = await supabase
      .from("budgets")
      .select("number, status, total_amount, valid_until, customers(name)")
      .eq("company_id", companyId)
      .in("status", ["draft", "sent", "approved"])
      .order("number", { ascending: false })
      .limit(8);

    if (error) {
      throw error;
    }

    return (data ?? []).map((budget) => {
      const row = budget as JoinedCustomerRow & {
        number: string;
        status: string;
        total_amount: string;
        valid_until: string | null;
      };

      return {
        customer: getJoinedCustomerName(row),
        number: `#${String(Number(row.number)).padStart(6, "0")}`,
        status: row.status,
        totalAmount: Number(row.total_amount),
        validUntil: row.valid_until
      };
    });
  }

  private async loadCustomersContext(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string
  ) {
    const { count, error: countError } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (countError) {
      throw countError;
    }

    const { data, error } = await supabase
      .from("customers")
      .select("name, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      throw error;
    }

    return {
      recentCustomers: (data ?? []).map((customer) => {
        const row = customer as { created_at: string; name: string };

        return {
          createdAt: row.created_at,
          name: row.name
        };
      }),
      total: count ?? 0
    };
  }

  private async loadSalesContext(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string
  ) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "number, status, total_amount, estimated_profit, sold_at, customers(name)"
      )
      .eq("company_id", companyId)
      .order("sold_at", { ascending: false })
      .limit(8);

    if (error) {
      throw error;
    }

    return (data ?? []).map((sale) => {
      const row = sale as JoinedCustomerRow & {
        estimated_profit: string;
        number: string;
        sold_at: string;
        status: string;
        total_amount: string;
      };

      return {
        customer: getJoinedCustomerName(row),
        estimatedProfit: Number(row.estimated_profit),
        number: `#${String(Number(row.number)).padStart(6, "0")}`,
        soldAt: row.sold_at,
        status: row.status,
        totalAmount: Number(row.total_amount)
      };
    });
  }
}
