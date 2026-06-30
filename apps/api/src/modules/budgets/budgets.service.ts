import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { AuditService } from "../audit/audit.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { BudgetItemDto } from "./dto/budget-item.dto";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { UpdateBudgetDto } from "./dto/update-budget.dto";

type BudgetStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "converted"
  | "cancelled";

type CustomerJoin = {
  address: string | null;
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
};

type BudgetRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  number: string;
  status: BudgetStatus;
  valid_until: string | null;
  subtotal_amount: string;
  discount_amount: string;
  total_amount: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: CustomerJoin | CustomerJoin[] | null;
};

type BudgetItemRow = {
  id: string;
  budget_id: string;
  product_id: string | null;
  product_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  estimated_cost: string;
};

type ProductRow = {
  id: string;
  name: string;
  sale_price: string;
  estimated_cost: string;
};

type CalculatedBudgetItem = {
  estimatedCost: number;
  productId: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível processar o orçamento."
  );
}

function getJoinedCustomer(row: BudgetRow) {
  if (Array.isArray(row.customers)) {
    return row.customers[0] ?? null;
  }

  return row.customers ?? null;
}

function formatBudgetNumber(value: number) {
  return `#${String(value).padStart(6, "0")}`;
}

function mapBudget(row: BudgetRow, itemRows: BudgetItemRow[]) {
  const customer = getJoinedCustomer(row);
  const number = Number(row.number);

  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customer: customer
      ? {
          id: customer.id,
          address: customer.address,
          email: customer.email,
          name: customer.name,
          phone: customer.phone
        }
      : null,
    number,
    numberLabel: formatBudgetNumber(number),
    status: row.status,
    validUntil: row.valid_until,
    subtotalAmount: Number(row.subtotal_amount),
    discountAmount: Number(row.discount_amount),
    totalAmount: Number(row.total_amount),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemRows.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
      estimatedCost: Number(item.estimated_cost)
    }))
  };
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly auditService: AuditService,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  async findAll(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data: budgets, error } = await supabase
      .from("budgets")
      .select(
        "id, company_id, customer_id, number, status, valid_until, subtotal_amount, discount_amount, total_amount, notes, created_at, updated_at, customers(id, name, phone, email, address)"
      )
      .eq("company_id", companyId)
      .order("number", { ascending: false });

    if (error) {
      throwDatabaseError(error);
    }

    const budgetRows = (budgets ?? []) as BudgetRow[];

    if (budgetRows.length === 0) {
      return [];
    }

    const { data: items, error: itemsError } = await supabase
      .from("budget_items")
      .select(
        "id, budget_id, product_id, product_name, quantity, unit_price, total_price, estimated_cost"
      )
      .eq("company_id", companyId)
      .in(
        "budget_id",
        budgetRows.map((budget) => budget.id)
      );

    if (itemsError) {
      throwDatabaseError(itemsError);
    }

    const itemRows = (items ?? []) as BudgetItemRow[];

    return budgetRows.map((budget) =>
      mapBudget(
        budget,
        itemRows.filter((item) => item.budget_id === budget.id)
      )
    );
  }

  async create(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateBudgetDto
  ) {
    await this.subscriptionsService.assertCanCreate(
      companyId,
      "budgets_per_month"
    );

    const supabase = this.supabaseFactory.createForUser(accessToken);

    await this.ensureCustomerExists(accessToken, companyId, dto.customerId);

    const calculatedItems = await this.calculateItems(
      accessToken,
      companyId,
      dto.items
    );
    const totals = this.calculateTotals(calculatedItems, dto.discountAmount ?? 0);
    const number = await this.getNextBudgetNumber(accessToken, companyId);

    const { data: budget, error } = await supabase
      .from("budgets")
      .insert({
        company_id: companyId,
        created_by: userId,
        customer_id: dto.customerId ?? null,
        discount_amount: totals.discountAmount,
        notes: normalizeText(dto.notes),
        number,
        subtotal_amount: totals.subtotalAmount,
        total_amount: totals.totalAmount,
        valid_until: dto.validUntil ?? null
      })
      .select(
        "id, company_id, customer_id, number, status, valid_until, subtotal_amount, discount_amount, total_amount, notes, created_at, updated_at, customers(id, name, phone, email, address)"
      )
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    const budgetRow = budget as BudgetRow;
    const { error: itemsError } = await supabase.from("budget_items").insert(
      calculatedItems.map((item) => ({
        budget_id: budgetRow.id,
        company_id: companyId,
        estimated_cost: item.estimatedCost,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        total_price: item.totalPrice,
        unit_price: item.unitPrice
      }))
    );

    if (itemsError) {
      await supabase.from("budgets").delete().eq("id", budgetRow.id);
      throwDatabaseError(itemsError);
    }

    const savedBudget = await this.findOne(accessToken, companyId, budgetRow.id);

    await this.auditService.record({
      action: "budget.created",
      companyId,
      entityId: budgetRow.id,
      entityType: "budget",
      metadata: {
        itemCount: calculatedItems.length,
        number,
        totalAmount: totals.totalAmount
      },
      userId
    });

    return savedBudget;
  }

  async update(
    accessToken: string,
    companyId: string,
    budgetId: string,
    userId: string,
    dto: UpdateBudgetDto
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const existing = await this.getBudgetRow(accessToken, companyId, budgetId);
    const payload: Record<string, unknown> = {};
    let calculatedItems: CalculatedBudgetItem[] | null = null;

    if (existing.status === "converted") {
      throw new BadRequestException(
        "Orçamentos convertidos não podem ser editados."
      );
    }

    if (dto.customerId !== undefined) {
      await this.ensureCustomerExists(accessToken, companyId, dto.customerId);
      payload.customer_id = dto.customerId ?? null;
    }

    if (dto.status !== undefined) {
      if (dto.status === "converted") {
        throw new BadRequestException(
          "Use a conversão para venda para marcar um orçamento como convertido."
        );
      }

      payload.status = dto.status;
    }

    if (dto.validUntil !== undefined) {
      payload.valid_until = dto.validUntil ?? null;
    }

    if (dto.notes !== undefined) {
      payload.notes = normalizeText(dto.notes);
    }

    if (dto.items !== undefined) {
      calculatedItems = await this.calculateItems(accessToken, companyId, dto.items);
    }

    if (calculatedItems || dto.discountAmount !== undefined) {
      const subtotalAmount = calculatedItems
        ? calculatedItems.reduce((total, item) => total + item.totalPrice, 0)
        : await this.getExistingSubtotal(accessToken, companyId, budgetId);
      const totals = this.calculateTotals(
        [],
        dto.discountAmount ?? Number(existing.discount_amount),
        subtotalAmount
      );

      payload.discount_amount = totals.discountAmount;
      payload.subtotal_amount = totals.subtotalAmount;
      payload.total_amount = totals.totalAmount;
    }

    const { data: budget, error } = await supabase
      .from("budgets")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", budgetId)
      .select(
        "id, company_id, customer_id, number, status, valid_until, subtotal_amount, discount_amount, total_amount, notes, created_at, updated_at, customers(id, name, phone, email, address)"
      )
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!budget) {
      throw new NotFoundException("Orçamento não encontrado.");
    }

    if (calculatedItems) {
      const { error: deleteError } = await supabase
        .from("budget_items")
        .delete()
        .eq("company_id", companyId)
        .eq("budget_id", budgetId);

      if (deleteError) {
        throwDatabaseError(deleteError);
      }

      const { error: insertError } = await supabase.from("budget_items").insert(
        calculatedItems.map((item) => ({
          budget_id: budgetId,
          company_id: companyId,
          estimated_cost: item.estimatedCost,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          total_price: item.totalPrice,
          unit_price: item.unitPrice
        }))
      );

      if (insertError) {
        throwDatabaseError(insertError);
      }
    }

    const savedBudget = await this.findOne(accessToken, companyId, budgetId);
    const budgetRow = budget as BudgetRow;
    const becameApproved =
      existing.status !== "approved" && budgetRow.status === "approved";

    await this.auditService.record({
      action: becameApproved ? "budget.approved" : "budget.updated",
      companyId,
      entityId: budgetId,
      entityType: "budget",
      metadata: {
        itemsChanged: Boolean(calculatedItems),
        nextStatus: budgetRow.status,
        number: Number(budgetRow.number),
        previousStatus: existing.status,
        totalAmount: Number(budgetRow.total_amount)
      },
      userId
    });

    return savedBudget;
  }

  async remove(
    accessToken: string,
    companyId: string,
    userId: string,
    budgetId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const existing = await this.getBudgetRow(accessToken, companyId, budgetId);

    if (existing.status === "converted") {
      throw new BadRequestException(
        "Orçamentos convertidos não podem ser excluídos."
      );
    }

    const { data, error } = await supabase
      .from("budgets")
      .delete()
      .eq("company_id", companyId)
      .eq("id", budgetId)
      .select("id")
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Orçamento não encontrado.");
    }

    await this.auditService.record({
      action: "budget.deleted",
      companyId,
      entityId: budgetId,
      entityType: "budget",
      metadata: {
        number: Number(existing.number),
        status: existing.status,
        totalAmount: Number(existing.total_amount)
      },
      userId
    });

    return { id: budgetId };
  }

  async findOne(accessToken: string, companyId: string, budgetId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const budget = await this.getBudgetRow(accessToken, companyId, budgetId);

    const { data: items, error } = await supabase
      .from("budget_items")
      .select(
        "id, budget_id, product_id, product_name, quantity, unit_price, total_price, estimated_cost"
      )
      .eq("company_id", companyId)
      .eq("budget_id", budgetId);

    if (error) {
      throwDatabaseError(error);
    }

    return mapBudget(budget, (items ?? []) as BudgetItemRow[]);
  }

  private async getBudgetRow(
    accessToken: string,
    companyId: string,
    budgetId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("budgets")
      .select(
        "id, company_id, customer_id, number, status, valid_until, subtotal_amount, discount_amount, total_amount, notes, created_at, updated_at, customers(id, name, phone, email, address)"
      )
      .eq("company_id", companyId)
      .eq("id", budgetId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Orçamento não encontrado.");
    }

    return data as BudgetRow;
  }

  private async ensureCustomerExists(
    accessToken: string,
    companyId: string,
    customerId: string | null | undefined
  ) {
    if (!customerId) {
      return;
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", customerId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new BadRequestException("Cliente do orçamento não encontrado.");
    }
  }

  private async calculateItems(
    accessToken: string,
    companyId: string,
    items: BudgetItemDto[]
  ): Promise<CalculatedBudgetItem[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];

    if (productIds.length !== items.length) {
      throw new BadRequestException("Use cada produto apenas uma vez no orçamento.");
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sale_price, estimated_cost")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("id", productIds);

    if (error) {
      throwDatabaseError(error);
    }

    const products = (data ?? []) as ProductRow[];

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        "Um ou mais produtos do orçamento não foram encontrados."
      );
    }

    return items.map((item) => {
      const product = products.find((current) => current.id === item.productId);

      if (!product) {
        throw new BadRequestException("Produto do orçamento não encontrado.");
      }

      const unitPrice = item.unitPrice ?? Number(product.sale_price);
      const totalPrice = roundMoney(item.quantity * unitPrice);

      return {
        estimatedCost: Number(product.estimated_cost),
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        totalPrice,
        unitPrice
      };
    });
  }

  private calculateTotals(
    items: CalculatedBudgetItem[],
    discountAmount: number,
    subtotalOverride?: number
  ) {
    const subtotalAmount = roundMoney(
      subtotalOverride ??
        items.reduce((total, item) => total + item.totalPrice, 0)
    );
    const roundedDiscount = roundMoney(discountAmount);

    if (roundedDiscount > subtotalAmount) {
      throw new BadRequestException(
        "O desconto não pode ser maior que o subtotal."
      );
    }

    return {
      discountAmount: roundedDiscount,
      subtotalAmount,
      totalAmount: roundMoney(subtotalAmount - roundedDiscount)
    };
  }

  private async getExistingSubtotal(
    accessToken: string,
    companyId: string,
    budgetId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("budget_items")
      .select("total_price")
      .eq("company_id", companyId)
      .eq("budget_id", budgetId);

    if (error) {
      throwDatabaseError(error);
    }

    return roundMoney(
      ((data ?? []) as Array<{ total_price: string }>).reduce(
        (total, item) => total + Number(item.total_price),
        0
      )
    );
  }

  private async getNextBudgetNumber(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("budgets")
      .select("number")
      .eq("company_id", companyId)
      .order("number", { ascending: false })
      .limit(1);

    if (error) {
      throwDatabaseError(error);
    }

    const currentNumber = Number((data?.[0] as { number?: string })?.number ?? 0);

    return currentNumber + 1;
  }
}
