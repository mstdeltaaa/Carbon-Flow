import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { AuditService } from "../audit/audit.service";
import { CreateFinancialTransactionDto } from "./dto/create-financial-transaction.dto";

type FinancialTransactionType = "income" | "expense";
type FinancialTransactionStatus = "pending" | "paid" | "cancelled";

type FinancialTransactionRow = {
  amount: string;
  category: string;
  company_id: string;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  id: string;
  paid_at: string | null;
  source_id: string | null;
  source_type: string;
  status: FinancialTransactionStatus;
  transaction_date: string;
  type: FinancialTransactionType;
  updated_at: string;
};

export type FinanceTransactionRollback = {
  id: string;
  status: FinancialTransactionStatus;
};

type SaleIncomeInput = {
  number: number;
  saleId: string;
  soldAt: string;
  totalAmount: number;
};

type SaleProfitRow = {
  estimated_profit: string;
  total_amount: string;
};

const transactionSelect =
  "id, company_id, type, status, category, description, amount, transaction_date, due_date, paid_at, source_type, source_id, created_by, created_at, updated_at";

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível processar o financeiro.",
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatNumber(value: number) {
  return `#${String(value).padStart(6, "0")}`;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getCurrentMonthPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    from: toDateOnly(start),
    to: toDateOnly(end),
  };
}

function isDateOnly(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getPeriod(from?: string, to?: string) {
  const fallback = getCurrentMonthPeriod();

  return {
    from: isDateOnly(from) ? from! : fallback.from,
    to: isDateOnly(to) ? to! : fallback.to,
  };
}

function getDateStartIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function getNextDateStartIso(date: string) {
  const nextDate = new Date(`${date}T00:00:00.000Z`);

  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  return nextDate.toISOString();
}

function mapTransaction(row: FinancialTransactionRow) {
  return {
    amount: Number(row.amount),
    category: row.category,
    companyId: row.company_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    dueDate: row.due_date,
    id: row.id,
    paidAt: row.paid_at,
    sourceId: row.source_id,
    sourceType: row.source_type,
    status: row.status,
    transactionDate: row.transaction_date,
    type: row.type,
    updatedAt: row.updated_at,
  };
}

function createCashFlowItem(date: string) {
  return {
    date,
    paidExpense: 0,
    paidIncome: 0,
    pendingExpense: 0,
    pendingIncome: 0,
    projectedBalance: 0,
    realizedBalance: 0,
  };
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    accessToken: string,
    companyId: string,
    from?: string,
    to?: string,
  ) {
    const period = getPeriod(from, to);
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("financial_transactions")
      .select(transactionSelect)
      .eq("company_id", companyId)
      .gte("transaction_date", period.from)
      .lte("transaction_date", period.to)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throwDatabaseError(error);
    }

    return ((data ?? []) as FinancialTransactionRow[]).map(mapTransaction);
  }

  async getSummary(
    accessToken: string,
    companyId: string,
    from?: string,
    to?: string,
  ) {
    const period = getPeriod(from, to);
    const [transactions, salesSummary] = await Promise.all([
      this.findAll(accessToken, companyId, period.from, period.to),
      this.getSalesProfitSummary(companyId, period.from, period.to),
    ]);
    const activeTransactions = transactions.filter(
      (transaction) => transaction.status !== "cancelled",
    );
    const paidTransactions = activeTransactions.filter(
      (transaction) => transaction.status === "paid",
    );
    const pendingTransactions = activeTransactions.filter(
      (transaction) => transaction.status === "pending",
    );
    const paidIncome = roundMoney(
      paidTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
    const paidExpense = roundMoney(
      paidTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
    const pendingIncome = roundMoney(
      pendingTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
    const pendingExpense = roundMoney(
      pendingTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
    const today = toDateOnly(new Date());
    const overdueTransactions = pendingTransactions.filter(
      (transaction) =>
        Boolean(transaction.dueDate) && String(transaction.dueDate) < today,
    );
    const overdueReceivable = roundMoney(
      overdueTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
    const overduePayable = roundMoney(
      overdueTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
    const categoryMap = new Map<
      string,
      {
        amount: number;
        category: string;
        count: number;
        type: FinancialTransactionType;
      }
    >();

    for (const transaction of activeTransactions) {
      const key = `${transaction.type}:${transaction.category}`;
      const current = categoryMap.get(key) ?? {
        amount: 0,
        category: transaction.category,
        count: 0,
        type: transaction.type,
      };

      current.amount = roundMoney(current.amount + transaction.amount);
      current.count += 1;
      categoryMap.set(key, current);
    }

    const cashFlowMap = new Map<
      string,
      ReturnType<typeof createCashFlowItem>
    >();

    for (const transaction of activeTransactions) {
      const item =
        cashFlowMap.get(transaction.transactionDate) ??
        createCashFlowItem(transaction.transactionDate);
      const amount = transaction.amount;

      if (transaction.status === "paid" && transaction.type === "income") {
        item.paidIncome = roundMoney(item.paidIncome + amount);
      }

      if (transaction.status === "paid" && transaction.type === "expense") {
        item.paidExpense = roundMoney(item.paidExpense + amount);
      }

      if (transaction.status === "pending" && transaction.type === "income") {
        item.pendingIncome = roundMoney(item.pendingIncome + amount);
      }

      if (transaction.status === "pending" && transaction.type === "expense") {
        item.pendingExpense = roundMoney(item.pendingExpense + amount);
      }

      item.realizedBalance = roundMoney(item.paidIncome - item.paidExpense);
      item.projectedBalance = roundMoney(
        item.paidIncome +
          item.pendingIncome -
          item.paidExpense -
          item.pendingExpense,
      );
      cashFlowMap.set(transaction.transactionDate, item);
    }

    return {
      byCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
      cashFlow: [...cashFlowMap.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      period,
      totals: {
        balance: roundMoney(paidIncome - paidExpense),
        cancelledCount: transactions.length - activeTransactions.length,
        estimatedOperatingProfit: roundMoney(
          salesSummary.estimatedProfit - paidExpense,
        ),
        estimatedProjectedProfit: roundMoney(
          salesSummary.estimatedProfit - paidExpense - pendingExpense,
        ),
        estimatedSalesProfit: salesSummary.estimatedProfit,
        paidExpense,
        paidIncome,
        payable: pendingExpense,
        pendingExpense,
        pendingIncome,
        paidCount: paidTransactions.length,
        pendingCount: pendingTransactions.length,
        projectedBalance: roundMoney(
          paidIncome + pendingIncome - paidExpense - pendingExpense,
        ),
        receivable: pendingIncome,
        overdueCount: overdueTransactions.length,
        overduePayable,
        overdueReceivable,
        salesCount: salesSummary.salesCount,
        salesRevenue: salesSummary.salesRevenue,
        transactionCount: transactions.length,
      },
    };
  }

  async createManual(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateFinancialTransactionDto,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const status = dto.status ?? "paid";
    const now = new Date();
    const { data, error } = await supabase
      .from("financial_transactions")
      .insert({
        amount: roundMoney(dto.amount),
        category: dto.category.trim(),
        company_id: companyId,
        created_by: userId,
        description: dto.description.trim(),
        due_date: dto.dueDate ?? null,
        paid_at: status === "paid" ? now.toISOString() : null,
        source_type: "manual",
        status,
        transaction_date: dto.transactionDate ?? toDateOnly(now),
        type: dto.type,
      })
      .select(transactionSelect)
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    const transaction = mapTransaction(data as FinancialTransactionRow);

    await this.auditService.record({
      action: "finance.transaction_created",
      companyId,
      entityId: transaction.id,
      entityType: "financial_transaction",
      metadata: {
        amount: transaction.amount,
        category: transaction.category,
        sourceType: transaction.sourceType,
        type: transaction.type,
      },
      userId,
    });

    return transaction;
  }

  async cancelManual(
    accessToken: string,
    companyId: string,
    userId: string,
    transactionId: string,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const existing = await this.getTransactionRow(
      accessToken,
      companyId,
      transactionId,
    );

    if (existing.source_type !== "manual") {
      throw new BadRequestException(
        "Lançamentos vinculados a vendas devem ser cancelados pela venda.",
      );
    }

    if (existing.status === "cancelled") {
      return mapTransaction(existing);
    }

    const { data, error } = await supabase
      .from("financial_transactions")
      .update({
        status: "cancelled",
      })
      .eq("company_id", companyId)
      .eq("id", transactionId)
      .select(transactionSelect)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Lançamento financeiro não encontrado.");
    }

    const transaction = mapTransaction(data as FinancialTransactionRow);

    await this.auditService.record({
      action: "finance.transaction_cancelled",
      companyId,
      entityId: transaction.id,
      entityType: "financial_transaction",
      metadata: {
        amount: transaction.amount,
        category: transaction.category,
        type: transaction.type,
      },
      userId,
    });

    return transaction;
  }

  async updateManual(
    accessToken: string,
    companyId: string,
    userId: string,
    transactionId: string,
    dto: CreateFinancialTransactionDto,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const existing = await this.getTransactionRow(
      accessToken,
      companyId,
      transactionId,
    );

    if (existing.source_type !== "manual") {
      throw new BadRequestException(
        "Lançamentos vinculados a vendas devem ser alterados pela venda.",
      );
    }

    if (existing.status === "cancelled") {
      throw new BadRequestException(
        "Lançamentos cancelados não podem ser editados.",
      );
    }

    const status =
      dto.status ?? (existing.status === "paid" ? "paid" : "pending");
    const paidAt =
      status === "paid" ? (existing.paid_at ?? new Date().toISOString()) : null;
    const { data, error } = await supabase
      .from("financial_transactions")
      .update({
        amount: roundMoney(dto.amount),
        category: dto.category.trim(),
        description: dto.description.trim(),
        due_date: dto.dueDate ?? null,
        paid_at: paidAt,
        status,
        transaction_date: dto.transactionDate ?? existing.transaction_date,
        type: dto.type,
      })
      .eq("company_id", companyId)
      .eq("id", transactionId)
      .select(transactionSelect)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Lançamento financeiro não encontrado.");
    }

    const transaction = mapTransaction(data as FinancialTransactionRow);

    await this.auditService.record({
      action: "finance.transaction_updated",
      companyId,
      entityId: transaction.id,
      entityType: "financial_transaction",
      metadata: {
        amount: transaction.amount,
        category: transaction.category,
        status: transaction.status,
        type: transaction.type,
      },
      userId,
    });

    return transaction;
  }

  async markManualAsPaid(
    accessToken: string,
    companyId: string,
    userId: string,
    transactionId: string,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const existing = await this.getTransactionRow(
      accessToken,
      companyId,
      transactionId,
    );

    if (existing.source_type !== "manual") {
      throw new BadRequestException(
        "Lançamentos vinculados a vendas devem ser alterados pela venda.",
      );
    }

    if (existing.status === "cancelled") {
      throw new BadRequestException(
        "Lançamentos cancelados não podem ser marcados como pagos.",
      );
    }

    if (existing.status === "paid") {
      return mapTransaction(existing);
    }

    const { data, error } = await supabase
      .from("financial_transactions")
      .update({
        paid_at: new Date().toISOString(),
        status: "paid",
      })
      .eq("company_id", companyId)
      .eq("id", transactionId)
      .select(transactionSelect)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Lançamento financeiro não encontrado.");
    }

    const transaction = mapTransaction(data as FinancialTransactionRow);

    await this.auditService.record({
      action: "finance.transaction_paid",
      companyId,
      entityId: transaction.id,
      entityType: "financial_transaction",
      metadata: {
        amount: transaction.amount,
        category: transaction.category,
        type: transaction.type,
      },
      userId,
    });

    return transaction;
  }

  async syncSaleIncome(
    accessToken: string,
    companyId: string,
    userId: string,
    input: SaleIncomeInput,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const transactionDate = toDateOnly(new Date(input.soldAt));
    const description = `Receita da venda ${formatNumber(input.number)}`;
    const existing = await this.findSaleTransaction(
      accessToken,
      companyId,
      input.saleId,
    );

    if (existing) {
      const { data, error } = await supabase
        .from("financial_transactions")
        .update({
          amount: roundMoney(input.totalAmount),
          category: "Vendas",
          description,
          paid_at: input.soldAt,
          status: "paid",
          transaction_date: transactionDate,
          type: "income",
        })
        .eq("company_id", companyId)
        .eq("id", existing.id)
        .select(transactionSelect)
        .single();

      if (error) {
        throwDatabaseError(error);
      }

      return mapTransaction(data as FinancialTransactionRow);
    }

    const { data, error } = await supabase
      .from("financial_transactions")
      .insert({
        amount: roundMoney(input.totalAmount),
        category: "Vendas",
        company_id: companyId,
        created_by: userId,
        description,
        paid_at: input.soldAt,
        source_id: input.saleId,
        source_type: "sale",
        status: "paid",
        transaction_date: transactionDate,
        type: "income",
      })
      .select(transactionSelect)
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    return mapTransaction(data as FinancialTransactionRow);
  }

  async cancelSaleIncome(
    accessToken: string,
    companyId: string,
    saleId: string,
  ): Promise<FinanceTransactionRollback[]> {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data: existing, error: selectError } = await supabase
      .from("financial_transactions")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("source_type", "sale")
      .eq("source_id", saleId);

    if (selectError) {
      throwDatabaseError(selectError);
    }

    const rollback = (
      (existing ?? []) as Array<{
        id: string;
        status: FinancialTransactionStatus;
      }>
    ).map((transaction) => ({
      id: transaction.id,
      status: transaction.status,
    }));

    if (rollback.length === 0) {
      return [];
    }

    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "cancelled" })
      .eq("company_id", companyId)
      .eq("source_type", "sale")
      .eq("source_id", saleId);

    if (error) {
      throwDatabaseError(error);
    }

    return rollback;
  }

  async restoreTransactions(
    accessToken: string,
    companyId: string,
    transactions: FinanceTransactionRollback[],
  ) {
    if (transactions.length === 0) {
      return;
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);

    for (const transaction of transactions) {
      await supabase
        .from("financial_transactions")
        .update({ status: transaction.status })
        .eq("company_id", companyId)
        .eq("id", transaction.id);
    }
  }

  async deleteSaleTransactions(
    accessToken: string,
    companyId: string,
    saleId: string,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    await supabase
      .from("financial_transactions")
      .delete()
      .eq("company_id", companyId)
      .eq("source_type", "sale")
      .eq("source_id", saleId);
  }

  private async getSalesProfitSummary(
    companyId: string,
    from: string,
    to: string,
  ) {
    const supabase = this.supabaseFactory.createAdmin();
    const { data, error } = await supabase
      .from("sales")
      .select("total_amount, estimated_profit")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("sold_at", getDateStartIso(from))
      .lt("sold_at", getNextDateStartIso(to));

    if (error) {
      throwDatabaseError(error);
    }

    const sales = (data ?? []) as SaleProfitRow[];

    return {
      estimatedProfit: roundMoney(
        sales.reduce((total, sale) => total + Number(sale.estimated_profit), 0),
      ),
      salesCount: sales.length,
      salesRevenue: roundMoney(
        sales.reduce((total, sale) => total + Number(sale.total_amount), 0),
      ),
    };
  }

  private async getTransactionRow(
    accessToken: string,
    companyId: string,
    transactionId: string,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("financial_transactions")
      .select(transactionSelect)
      .eq("company_id", companyId)
      .eq("id", transactionId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Lançamento financeiro não encontrado.");
    }

    return data as FinancialTransactionRow;
  }

  private async findSaleTransaction(
    accessToken: string,
    companyId: string,
    saleId: string,
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("financial_transactions")
      .select(transactionSelect)
      .eq("company_id", companyId)
      .eq("source_type", "sale")
      .eq("source_id", saleId)
      .limit(1);

    if (error) {
      throwDatabaseError(error);
    }

    return ((data ?? []) as FinancialTransactionRow[])[0] ?? null;
  }
}
