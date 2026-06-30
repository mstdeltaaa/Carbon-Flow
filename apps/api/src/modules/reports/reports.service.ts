import { BadRequestException, Injectable } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";

type SaleRow = {
  estimated_profit: string;
  id: string;
  number: string;
  sold_at: string;
  status: "completed" | "cancelled" | "refunded";
  total_amount: string;
  customers?: { name: string } | { name: string }[] | null;
};

type SaleItemRow = {
  estimated_unit_cost: string;
  product_id: string | null;
  product_name: string;
  quantity: string;
  sale_id: string;
  total_price: string;
};

type IngredientRow = {
  category: string | null;
  id: string;
  inventory_unit: string;
  minimum_stock: string;
  name: string;
  stock_quantity: string;
};

type FinancialTransactionRow = {
  amount: string;
  category: string;
  due_date: string | null;
  id: string;
  status: "pending" | "paid" | "cancelled";
  transaction_date: string;
  type: "income" | "expense";
};

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível carregar os relatórios.",
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isDateOnly(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getCurrentMonthPeriod() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  return {
    from: toDateOnly(from),
    to: toDateOnly(to),
  };
}

function getPeriod(from?: string, to?: string) {
  if (!from && !to) {
    return getCurrentMonthPeriod();
  }

  if (!isDateOnly(from) || !isDateOnly(to)) {
    throw new BadRequestException(
      "Informe o período no formato AAAA-MM-DD para gerar relatórios.",
    );
  }

  if (String(from) > String(to)) {
    throw new BadRequestException(
      "A data inicial do relatório não pode ser maior que a data final.",
    );
  }

  return {
    from: String(from),
    to: String(to),
  };
}

function getSalesDateRange(period: { from: string; to: string }) {
  const endDate = new Date(`${period.to}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  return {
    from: `${period.from}T00:00:00.000Z`,
    toExclusive: endDate.toISOString(),
  };
}

function getDaysInPeriod(period: { from: string; to: string }) {
  const dates: string[] = [];
  const cursor = new Date(`${period.from}T00:00:00.000Z`);
  const end = new Date(`${period.to}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);

    if (dates.length > 370) {
      break;
    }
  }

  return dates;
}

function getJoinedCustomerName(row: SaleRow) {
  if (Array.isArray(row.customers)) {
    return row.customers[0]?.name ?? null;
  }

  return row.customers?.name ?? null;
}

function formatSaleNumber(value: string) {
  return `#${String(Number(value)).padStart(6, "0")}`;
}

@Injectable()
export class ReportsService {
  constructor(private readonly supabaseFactory: SupabaseClientFactory) {}

  async getOverview(
    accessToken: string,
    companyId: string,
    from?: string,
    to?: string,
  ) {
    const period = getPeriod(from, to);
    const salesRange = getSalesDateRange(period);
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const [salesResult, financeResult, ingredientsResult] = await Promise.all([
      supabase
        .from("sales")
        .select(
          "id, number, status, total_amount, estimated_profit, sold_at, customers(name)",
        )
        .eq("company_id", companyId)
        .eq("status", "completed")
        .gte("sold_at", salesRange.from)
        .lt("sold_at", salesRange.toExclusive)
        .order("sold_at", { ascending: false }),
      supabase
        .from("financial_transactions")
        .select(
          "id, type, status, category, amount, transaction_date, due_date",
        )
        .eq("company_id", companyId)
        .gte("transaction_date", period.from)
        .lte("transaction_date", period.to)
        .order("transaction_date", { ascending: true }),
      supabase
        .from("ingredients")
        .select(
          "id, name, category, inventory_unit, stock_quantity, minimum_stock",
        )
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (salesResult.error) {
      throwDatabaseError(salesResult.error);
    }

    if (financeResult.error) {
      throwDatabaseError(financeResult.error);
    }

    if (ingredientsResult.error) {
      throwDatabaseError(ingredientsResult.error);
    }

    const sales = (salesResult.data ?? []) as SaleRow[];
    const saleIds = sales.map((sale) => sale.id);
    const saleItems = await this.getSaleItems(accessToken, companyId, saleIds);
    const finance = (financeResult.data ?? []) as FinancialTransactionRow[];
    const ingredients = (ingredientsResult.data ?? []) as IngredientRow[];

    return {
      finance: this.buildFinanceReport(finance),
      lowStock: this.buildLowStockReport(ingredients),
      period: {
        ...period,
        days: getDaysInPeriod(period).length,
      },
      sales: this.buildSalesReport(period, sales, saleItems),
    };
  }

  private async getSaleItems(
    accessToken: string,
    companyId: string,
    saleIds: string[],
  ) {
    if (saleIds.length === 0) {
      return [];
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, product_name, quantity, total_price, estimated_unit_cost",
      )
      .eq("company_id", companyId)
      .in("sale_id", saleIds);

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as SaleItemRow[];
  }

  private buildSalesReport(
    period: { from: string; to: string },
    sales: SaleRow[],
    saleItems: SaleItemRow[],
  ) {
    const revenue = roundMoney(
      sales.reduce((total, sale) => total + Number(sale.total_amount), 0),
    );
    const estimatedProfit = roundMoney(
      sales.reduce((total, sale) => total + Number(sale.estimated_profit), 0),
    );
    const saleIds = new Set(sales.map((sale) => sale.id));
    const salesByDay = new Map(
      getDaysInPeriod(period).map((date) => [
        date,
        {
          date,
          estimatedProfit: 0,
          revenue: 0,
          salesCount: 0,
        },
      ]),
    );
    const productMap = new Map<
      string,
      {
        estimatedCost: number;
        estimatedProfit: number;
        productId: string | null;
        productName: string;
        quantity: number;
        revenue: number;
      }
    >();

    for (const sale of sales) {
      const date = sale.sold_at.slice(0, 10);
      const day = salesByDay.get(date) ?? {
        date,
        estimatedProfit: 0,
        revenue: 0,
        salesCount: 0,
      };

      day.estimatedProfit = roundMoney(
        day.estimatedProfit + Number(sale.estimated_profit),
      );
      day.revenue = roundMoney(day.revenue + Number(sale.total_amount));
      day.salesCount += 1;
      salesByDay.set(date, day);
    }

    for (const item of saleItems) {
      if (!saleIds.has(item.sale_id)) {
        continue;
      }

      const key = item.product_id ?? item.product_name;
      const quantity = Number(item.quantity);
      const revenueAmount = Number(item.total_price);
      const estimatedCost = Number(item.estimated_unit_cost) * quantity;
      const current = productMap.get(key) ?? {
        estimatedCost: 0,
        estimatedProfit: 0,
        productId: item.product_id,
        productName: item.product_name,
        quantity: 0,
        revenue: 0,
      };

      current.estimatedCost = roundMoney(current.estimatedCost + estimatedCost);
      current.estimatedProfit = roundMoney(
        current.estimatedProfit + revenueAmount - estimatedCost,
      );
      current.quantity = roundQuantity(current.quantity + quantity);
      current.revenue = roundMoney(current.revenue + revenueAmount);
      productMap.set(key, current);
    }

    return {
      averageTicket: sales.length > 0 ? roundMoney(revenue / sales.length) : 0,
      estimatedMargin:
        revenue > 0 ? Math.round((estimatedProfit / revenue) * 1000) / 10 : 0,
      estimatedProfit,
      recentSales: sales.slice(0, 8).map((sale) => ({
        customerName: getJoinedCustomerName(sale),
        estimatedProfit: Number(sale.estimated_profit),
        id: sale.id,
        numberLabel: formatSaleNumber(sale.number),
        soldAt: sale.sold_at,
        totalAmount: Number(sale.total_amount),
      })),
      revenue,
      salesByDay: [...salesByDay.values()],
      salesCount: sales.length,
      topProducts: [...productMap.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
    };
  }

  private buildFinanceReport(transactions: FinancialTransactionRow[]) {
    const activeTransactions = transactions.filter(
      (transaction) => transaction.status !== "cancelled",
    );
    const categoryMap = new Map<
      string,
      {
        amount: number;
        category: string;
        count: number;
        paidAmount: number;
        pendingAmount: number;
        type: "income" | "expense";
      }
    >();
    const today = toDateOnly(new Date());
    const totals = {
      cancelledCount: transactions.length - activeTransactions.length,
      overdueCount: 0,
      overduePayable: 0,
      overdueReceivable: 0,
      paidExpense: 0,
      paidIncome: 0,
      pendingExpense: 0,
      pendingIncome: 0,
      transactionCount: transactions.length,
    };

    for (const transaction of activeTransactions) {
      const amount = Number(transaction.amount);
      const key = `${transaction.type}:${transaction.category}`;
      const category = categoryMap.get(key) ?? {
        amount: 0,
        category: transaction.category,
        count: 0,
        paidAmount: 0,
        pendingAmount: 0,
        type: transaction.type,
      };

      category.amount = roundMoney(category.amount + amount);
      category.count += 1;

      if (transaction.status === "paid") {
        category.paidAmount = roundMoney(category.paidAmount + amount);

        if (transaction.type === "income") {
          totals.paidIncome = roundMoney(totals.paidIncome + amount);
        } else {
          totals.paidExpense = roundMoney(totals.paidExpense + amount);
        }
      }

      if (transaction.status === "pending") {
        category.pendingAmount = roundMoney(category.pendingAmount + amount);

        if (transaction.type === "income") {
          totals.pendingIncome = roundMoney(totals.pendingIncome + amount);
        } else {
          totals.pendingExpense = roundMoney(totals.pendingExpense + amount);
        }

        if (transaction.due_date && transaction.due_date < today) {
          totals.overdueCount += 1;

          if (transaction.type === "income") {
            totals.overdueReceivable = roundMoney(
              totals.overdueReceivable + amount,
            );
          } else {
            totals.overduePayable = roundMoney(totals.overduePayable + amount);
          }
        }
      }

      categoryMap.set(key, category);
    }

    return {
      byCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
      totals: {
        ...totals,
        projectedBalance: roundMoney(
          totals.paidIncome +
            totals.pendingIncome -
            totals.paidExpense -
            totals.pendingExpense,
        ),
        realizedBalance: roundMoney(totals.paidIncome - totals.paidExpense),
      },
    };
  }

  private buildLowStockReport(ingredients: IngredientRow[]) {
    const items = ingredients
      .filter(
        (ingredient) =>
          Number(ingredient.stock_quantity) <= Number(ingredient.minimum_stock),
      )
      .map((ingredient) => ({
        category: ingredient.category,
        current: Number(ingredient.stock_quantity),
        id: ingredient.id,
        minimum: Number(ingredient.minimum_stock),
        name: ingredient.name,
        shortage: roundQuantity(
          Math.max(
            0,
            Number(ingredient.minimum_stock) -
              Number(ingredient.stock_quantity),
          ),
        ),
        unit: ingredient.inventory_unit,
      }))
      .sort((a, b) => b.shortage - a.shortage);

    return {
      count: items.length,
      items: items.slice(0, 12),
    };
  }
}
