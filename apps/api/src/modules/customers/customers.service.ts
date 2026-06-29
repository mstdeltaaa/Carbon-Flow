import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { hasCompanyPermission } from "../../common/access-control/permissions";
import { type CurrentCompany } from "../../common/decorators/current-company.decorator";
import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

type SaleStatus = "completed" | "cancelled" | "refunded";

type CustomerSummary = {
  budgetsCount: number;
  estimatedProfit: number;
  lastSaleAt: string | null;
  openBudgetsCount: number;
  salesCount: number;
  totalSpent: number;
};

type BudgetSummaryRow = {
  customer_id: string | null;
  status: BudgetStatus;
  total_amount: string;
};

type SaleSummaryRow = {
  customer_id: string | null;
  estimated_profit: string;
  sold_at: string;
  status: SaleStatus;
  total_amount: string;
};

type BudgetHistoryRow = BudgetSummaryRow & {
  created_at: string;
  id: string;
  number: string;
  valid_until: string | null;
};

type SaleHistoryRow = SaleSummaryRow & {
  created_at: string;
  id: string;
  number: string;
};

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeEmail(value: string | undefined) {
  const trimmed = normalizeText(value);

  return trimmed ? trimmed.toLowerCase() : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createEmptySummary(): CustomerSummary {
  return {
    budgetsCount: 0,
    estimatedProfit: 0,
    lastSaleAt: null,
    openBudgetsCount: 0,
    salesCount: 0,
    totalSpent: 0
  };
}

function formatNumber(value: number) {
  return `#${String(value).padStart(6, "0")}`;
}

function mapCustomer(row: CustomerRow, summary = createEmptySummary()) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summary
  };
}

function mapBudgetHistory(row: BudgetHistoryRow) {
  const number = Number(row.number);

  return {
    id: row.id,
    number,
    numberLabel: formatNumber(number),
    status: row.status,
    totalAmount: Number(row.total_amount),
    validUntil: row.valid_until,
    createdAt: row.created_at
  };
}

function mapSaleHistory(row: SaleHistoryRow) {
  const number = Number(row.number);

  return {
    id: row.id,
    number,
    numberLabel: formatNumber(number),
    status: row.status,
    totalAmount: Number(row.total_amount),
    estimatedProfit: Number(row.estimated_profit),
    soldAt: row.sold_at,
    createdAt: row.created_at
  };
}

function buildSummary(
  budgets: BudgetSummaryRow[],
  sales: SaleSummaryRow[]
): CustomerSummary {
  const summary = createEmptySummary();

  for (const budget of budgets) {
    summary.budgetsCount += 1;

    if (["draft", "sent", "approved"].includes(budget.status)) {
      summary.openBudgetsCount += 1;
    }
  }

  for (const sale of sales) {
    if (sale.status !== "completed") {
      continue;
    }

    summary.salesCount += 1;
    summary.totalSpent += Number(sale.total_amount);
    summary.estimatedProfit += Number(sale.estimated_profit);

    if (!summary.lastSaleAt || sale.sold_at > summary.lastSaleAt) {
      summary.lastSaleAt = sale.sold_at;
    }
  }

  return {
    ...summary,
    estimatedProfit: roundMoney(summary.estimatedProfit),
    totalSpent: roundMoney(summary.totalSpent)
  };
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Nao foi possivel processar o cliente."
  );
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  async findAll(accessToken: string, company: CurrentCompany) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, company_id, name, phone, email, address, notes, created_at, updated_at"
      )
      .eq("company_id", company.id)
      .order("name", { ascending: true });

    if (error) {
      throwDatabaseError(error);
    }

    const customers = (data ?? []) as CustomerRow[];
    const summaries = await this.getCustomerSummaries(
      accessToken,
      company,
      customers.map((customer) => customer.id)
    );

    return customers.map((row) => mapCustomer(row, summaries.get(row.id)));
  }

  async create(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateCustomerDto
  ) {
    await this.subscriptionsService.assertCanCreate(companyId, "customers");

    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data, error } = await supabase
      .from("customers")
      .insert({
        address: normalizeText(dto.address),
        company_id: companyId,
        created_by: userId,
        email: normalizeEmail(dto.email),
        name: dto.name.trim(),
        notes: normalizeText(dto.notes),
        phone: normalizeText(dto.phone)
      })
      .select(
        "id, company_id, name, phone, email, address, notes, created_at, updated_at"
      )
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    return mapCustomer(data as CustomerRow);
  }

  async update(
    accessToken: string,
    company: CurrentCompany,
    customerId: string,
    dto: UpdateCustomerDto
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const payload: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      payload.phone = normalizeText(dto.phone);
    }

    if (dto.email !== undefined) {
      payload.email = normalizeEmail(dto.email);
    }

    if (dto.address !== undefined) {
      payload.address = normalizeText(dto.address);
    }

    if (dto.notes !== undefined) {
      payload.notes = normalizeText(dto.notes);
    }

    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("company_id", company.id)
      .eq("id", customerId)
      .select(
        "id, company_id, name, phone, email, address, notes, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Cliente nao encontrado.");
    }

    const summaries = await this.getCustomerSummaries(accessToken, company, [
      customerId
    ]);

    return mapCustomer(data as CustomerRow, summaries.get(customerId));
  }

  async findHistory(
    accessToken: string,
    company: CurrentCompany,
    customerId: string
  ) {
    const customer = await this.getCustomerRow(
      accessToken,
      company.id,
      customerId
    );
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const canReadBudgets = hasCompanyPermission(
      company.role,
      company.permissions,
      "budgets"
    );
    const canReadSales = hasCompanyPermission(
      company.role,
      company.permissions,
      "sales"
    );

    const budgets = canReadBudgets
      ? await this.getCustomerBudgets(supabase, company.id, customerId)
      : [];
    const sales = canReadSales
      ? await this.getCustomerSales(supabase, company.id, customerId)
      : [];
    const summary = buildSummary(budgets, sales);

    return {
      customer: mapCustomer(customer, summary),
      summary,
      budgets: budgets.map(mapBudgetHistory),
      sales: sales.map(mapSaleHistory)
    };
  }

  async remove(accessToken: string, companyId: string, customerId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data, error } = await supabase
      .from("customers")
      .delete()
      .eq("company_id", companyId)
      .eq("id", customerId)
      .select("id")
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Cliente nao encontrado.");
    }

    return { id: customerId };
  }

  private async getCustomerRow(
    accessToken: string,
    companyId: string,
    customerId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, company_id, name, phone, email, address, notes, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("id", customerId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Cliente nao encontrado.");
    }

    return data as CustomerRow;
  }

  private async getCustomerSummaries(
    accessToken: string,
    company: CurrentCompany,
    customerIds: string[]
  ) {
    const summaries = new Map<string, CustomerSummary>();

    for (const customerId of customerIds) {
      summaries.set(customerId, createEmptySummary());
    }

    if (customerIds.length === 0) {
      return summaries;
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const canReadBudgets = hasCompanyPermission(
      company.role,
      company.permissions,
      "budgets"
    );
    const canReadSales = hasCompanyPermission(
      company.role,
      company.permissions,
      "sales"
    );

    const budgets = canReadBudgets
      ? await this.getCustomerBudgetSummaries(supabase, company.id, customerIds)
      : [];
    const sales = canReadSales
      ? await this.getCustomerSaleSummaries(supabase, company.id, customerIds)
      : [];

    const budgetsByCustomer = new Map<string, BudgetSummaryRow[]>();
    const salesByCustomer = new Map<string, SaleSummaryRow[]>();

    for (const budget of budgets) {
      if (!budget.customer_id) {
        continue;
      }

      budgetsByCustomer.set(budget.customer_id, [
        ...(budgetsByCustomer.get(budget.customer_id) ?? []),
        budget
      ]);
    }

    for (const sale of sales) {
      if (!sale.customer_id) {
        continue;
      }

      salesByCustomer.set(sale.customer_id, [
        ...(salesByCustomer.get(sale.customer_id) ?? []),
        sale
      ]);
    }

    for (const customerId of customerIds) {
      summaries.set(
        customerId,
        buildSummary(
          budgetsByCustomer.get(customerId) ?? [],
          salesByCustomer.get(customerId) ?? []
        )
      );
    }

    return summaries;
  }

  private async getCustomerBudgetSummaries(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string,
    customerIds: string[]
  ) {
    const { data, error } = await supabase
      .from("budgets")
      .select("customer_id, status, total_amount")
      .eq("company_id", companyId)
      .in("customer_id", customerIds);

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as BudgetSummaryRow[];
  }

  private async getCustomerSaleSummaries(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string,
    customerIds: string[]
  ) {
    const { data, error } = await supabase
      .from("sales")
      .select("customer_id, status, total_amount, estimated_profit, sold_at")
      .eq("company_id", companyId)
      .in("customer_id", customerIds);

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as SaleSummaryRow[];
  }

  private async getCustomerBudgets(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string,
    customerId: string
  ) {
    const { data, error } = await supabase
      .from("budgets")
      .select(
        "id, customer_id, number, status, valid_until, total_amount, created_at"
      )
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as BudgetHistoryRow[];
  }

  private async getCustomerSales(
    supabase: ReturnType<SupabaseClientFactory["createForUser"]>,
    companyId: string,
    customerId: string
  ) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "id, customer_id, number, status, total_amount, estimated_profit, sold_at, created_at"
      )
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("sold_at", { ascending: false });

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as SaleHistoryRow[];
  }
}
