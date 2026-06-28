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

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Nao foi possivel carregar o dashboard."
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
      openBudgets.reduce((total, budget) => total + Number(budget.total_amount), 0)
    );

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
        detail: `Atual: ${ingredient.current} ${ingredient.unit} / Minimo: ${ingredient.minimum} ${ingredient.unit}`,
        severity: "warning" as const,
        title: ingredient.name,
        type: "low_stock" as const
      })),
      ...(openBudgets.length > 0
        ? [
            {
              detail: `${openBudgets.length} orcamentos em aberto`,
              severity: "info" as const,
              title: "Orcamentos pendentes",
              type: "open_budgets" as const
            }
          ]
        : [])
    ];

    return {
      period: {
        label: "Mes atual",
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      },
      metrics: {
        estimatedProfit,
        lowStockCount: lowStock.length,
        openBudgetAmount,
        openBudgetCount: openBudgets.length,
        revenue,
        salesCount: sales.length
      },
      bestSellers,
      lowStock: lowStock.slice(0, 5),
      alerts: alerts.slice(0, 6)
    };
  }
}
