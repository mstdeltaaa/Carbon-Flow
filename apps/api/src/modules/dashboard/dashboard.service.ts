import { BadRequestException, Injectable } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";

type SaleRow = {
  id: string;
  total_amount: string;
  estimated_profit: string;
  status: string;
  sold_at: string;
};

type SaleItemRow = {
  product_id: string | null;
  product_name: string;
  quantity: string;
  total_price: string;
};

type IngredientRow = {
  id: string;
  name: string;
  category: string | null;
  inventory_unit: string;
  stock_quantity: string;
  minimum_stock: string;
};

type BudgetRow = {
  id: string;
  status: string;
  total_amount: string;
};

type FinancialTransactionRow = {
  amount: string;
  category: string;
  description: string;
  due_date: string | null;
  id: string;
  status: "pending" | "paid" | "cancelled";
  transaction_date: string;
  type: "income" | "expense";
};

type CountResult = {
  count: number | null;
  error: { message?: string } | null;
};

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível carregar o dashboard."
  );
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

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
  constructor(private readonly supabaseFactory: SupabaseClientFactory) {}

  async getSummary(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const periodStart = getMonthStart();
    const periodEnd = getNextMonthStart();

    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("id, total_amount, estimated_profit, status, sold_at")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("sold_at", periodStart.toISOString())
      .lt("sold_at", periodEnd.toISOString());

    if (salesError) {
      throwDatabaseError(salesError);
    }

    const sales = (salesData ?? []) as SaleRow[];
    const saleIds = sales.map((sale) => sale.id);
    const revenue = roundMoney(
      sales.reduce((total, sale) => total + Number(sale.total_amount), 0)
    );
    const estimatedProfit = roundMoney(
      sales.reduce((total, sale) => total + Number(sale.estimated_profit), 0)
    );

    const { data: lowStockData, error: lowStockError } = await supabase
      .from("ingredients")
      .select(
        "id, name, category, inventory_unit, stock_quantity, minimum_stock"
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (lowStockError) {
      throwDatabaseError(lowStockError);
    }

    const [
      ingredientCountResult,
      productCountResult,
      customerCountResult,
      budgetCountResult,
      saleCountResult
    ] = await Promise.all([
      supabase
        .from("ingredients")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId),
      supabase
        .from("budgets")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId),
      supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "completed")
    ]);
    const countResults = [
      ingredientCountResult,
      productCountResult,
      customerCountResult,
      budgetCountResult,
      saleCountResult
    ] as CountResult[];
    const countError = countResults.find((result) => result.error)?.error;

    if (countError) {
      throwDatabaseError(countError);
    }

    const onboardingCounts = {
      budgets: budgetCountResult.count ?? 0,
      company: 1,
      customers: customerCountResult.count ?? 0,
      ingredients: ingredientCountResult.count ?? 0,
      products: productCountResult.count ?? 0,
      sales: saleCountResult.count ?? 0
    };
    const onboardingCompletedSteps = [
      onboardingCounts.company > 0,
      onboardingCounts.ingredients > 0,
      onboardingCounts.products > 0,
      onboardingCounts.customers > 0,
      onboardingCounts.budgets > 0,
      onboardingCounts.sales > 0
    ].filter(Boolean).length;
    const onboardingTotalSteps = 6;

    const lowStock = ((lowStockData ?? []) as IngredientRow[])
      .filter(
        (ingredient) =>
          Number(ingredient.stock_quantity) <= Number(ingredient.minimum_stock)
      )
      .map((ingredient) => ({
        category: ingredient.category,
        current: Number(ingredient.stock_quantity),
        id: ingredient.id,
        minimum: Number(ingredient.minimum_stock),
        name: ingredient.name,
        unit: ingredient.inventory_unit
      }));

    const { data: budgetsData, error: budgetsError } = await supabase
      .from("budgets")
      .select("id, status, total_amount")
      .eq("company_id", companyId)
      .in("status", ["draft", "sent", "approved"]);

    if (budgetsError) {
      throwDatabaseError(budgetsError);
    }

    const openBudgets = (budgetsData ?? []) as BudgetRow[];
    const openBudgetAmount = roundMoney(
      openBudgets.reduce(
        (total, budget) => total + Number(budget.total_amount),
        0
      )
    );

    const periodStartDate = toDateOnly(periodStart);
    const periodEndDate = toDateOnly(periodEnd);
    const today = toDateOnly(new Date());
    const { data: financeData, error: financeError } = await supabase
      .from("financial_transactions")
      .select(
        "id, type, status, category, description, amount, transaction_date, due_date"
      )
      .eq("company_id", companyId)
      .gte("transaction_date", periodStartDate)
      .lt("transaction_date", periodEndDate);

    if (financeError) {
      throwDatabaseError(financeError);
    }

    const financialTransactions = (financeData ??
      []) as FinancialTransactionRow[];
    const activeFinancialTransactions = financialTransactions.filter(
      (transaction) => transaction.status !== "cancelled"
    );
    const paidFinancialTransactions = activeFinancialTransactions.filter(
      (transaction) => transaction.status === "paid"
    );
    const pendingFinancialTransactions = activeFinancialTransactions.filter(
      (transaction) => transaction.status === "pending"
    );
    const paidIncome = roundMoney(
      paidFinancialTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((total, transaction) => total + Number(transaction.amount), 0)
    );
    const paidExpense = roundMoney(
      paidFinancialTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + Number(transaction.amount), 0)
    );
    const pendingIncome = roundMoney(
      pendingFinancialTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((total, transaction) => total + Number(transaction.amount), 0)
    );
    const pendingExpense = roundMoney(
      pendingFinancialTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + Number(transaction.amount), 0)
    );

    const { data: pendingDueData, error: pendingDueError } = await supabase
      .from("financial_transactions")
      .select(
        "id, type, status, category, description, amount, transaction_date, due_date"
      )
      .eq("company_id", companyId)
      .eq("status", "pending")
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });

    if (pendingDueError) {
      throwDatabaseError(pendingDueError);
    }

    const pendingDueTransactions = (pendingDueData ??
      []) as FinancialTransactionRow[];
    const overdueTransactions = pendingDueTransactions.filter(
      (transaction) => transaction.due_date && transaction.due_date < today
    );
    const overdueAmount = roundMoney(
      overdueTransactions.reduce(
        (total, transaction) => total + Number(transaction.amount),
        0
      )
    );
    const upcomingDue = pendingDueTransactions
      .slice(0, 5)
      .map((transaction) => ({
        amount: Number(transaction.amount),
        category: transaction.category,
        description: transaction.description,
        dueDate: transaction.due_date,
        id: transaction.id,
        isOverdue: Boolean(
          transaction.due_date && transaction.due_date < today
        ),
        type: transaction.type
      }));

    let saleItems: SaleItemRow[] = [];

    if (saleIds.length > 0) {
      const { data: saleItemsData, error: saleItemsError } = await supabase
        .from("sale_items")
        .select("product_id, product_name, quantity, total_price")
        .eq("company_id", companyId)
        .in("sale_id", saleIds);

      if (saleItemsError) {
        throwDatabaseError(saleItemsError);
      }

      saleItems = (saleItemsData ?? []) as SaleItemRow[];
    }

    const productMap = new Map<
      string,
      {
        productId: string | null;
        productName: string;
        quantity: number;
        revenue: number;
      }
    >();

    for (const item of saleItems) {
      const key = item.product_id ?? item.product_name;
      const current = productMap.get(key);

      if (current) {
        current.quantity += Number(item.quantity);
        current.revenue += Number(item.total_price);
      } else {
        productMap.set(key, {
          productId: item.product_id,
          productName: item.product_name,
          quantity: Number(item.quantity),
          revenue: Number(item.total_price)
        });
      }
    }

    const bestSellers = [...productMap.values()]
      .map((product) => ({
        ...product,
        revenue: roundMoney(product.revenue)
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const alerts = [
      ...lowStock.slice(0, 5).map((ingredient) => ({
        detail: `Atual: ${ingredient.current} ${ingredient.unit} / Mínimo: ${ingredient.minimum} ${ingredient.unit}`,
        severity: "warning" as const,
        title: ingredient.name,
        type: "low_stock" as const
      })),
      ...(openBudgets.length > 0
        ? [
            {
              detail: `${openBudgets.length} orçamentos em aberto`,
              severity: "info" as const,
              title: "Orçamentos pendentes",
              type: "open_budgets" as const
            }
          ]
        : []),
      ...(overdueTransactions.length > 0
        ? [
            {
              detail: `${overdueTransactions.length} lançamento(s) vencido(s), totalizando ${overdueAmount}`,
              severity: "warning" as const,
              title: "Financeiro vencido",
              type: "financial_overdue" as const
            }
          ]
        : [])
    ];

    return {
      period: {
        label: "Mês atual",
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      },
      metrics: {
        estimatedProfit,
        lowStockCount: lowStock.length,
        openBudgetAmount,
        openBudgetCount: openBudgets.length,
        overdueAmount,
        overdueCount: overdueTransactions.length,
        paidExpense,
        paidIncome,
        pendingExpense,
        pendingIncome,
        revenue,
        salesCount: sales.length
      },
      finance: {
        balance: roundMoney(paidIncome - paidExpense),
        paidExpense,
        paidIncome,
        pendingBalance: roundMoney(pendingIncome - pendingExpense),
        pendingExpense,
        pendingIncome,
        upcomingDue
      },
      onboarding: {
        completedSteps: onboardingCompletedSteps,
        counts: onboardingCounts,
        isComplete: onboardingCompletedSteps === onboardingTotalSteps,
        progress: Math.round(
          (onboardingCompletedSteps / onboardingTotalSteps) * 100
        ),
        totalSteps: onboardingTotalSteps
      },
      bestSellers,
      lowStock: lowStock.slice(0, 5),
      alerts: alerts.slice(0, 6)
    };
  }
}
