import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { AuditService } from "../audit/audit.service";
import {
  FinanceService,
  type FinanceTransactionRollback
} from "../finance/finance.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

type SaleStatus = "completed" | "cancelled" | "refunded";
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

type BudgetJoin = {
  id: string;
  number: string;
  status: BudgetStatus;
};

type SaleRow = {
  id: string;
  budget_id: string | null;
  company_id: string;
  customer_id: string | null;
  discount_amount: string;
  estimated_profit: string;
  number: string;
  sold_at: string;
  status: SaleStatus;
  subtotal_amount: string;
  total_amount: string;
  created_at: string;
  updated_at: string;
  budgets?: BudgetJoin | BudgetJoin[] | null;
  customers?: CustomerJoin | CustomerJoin[] | null;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  estimated_unit_cost: string;
};

type BudgetRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  discount_amount: string;
  number: string;
  status: BudgetStatus;
  subtotal_amount: string;
  total_amount: string;
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
  estimated_cost: string;
  id: string;
  name: string;
  sale_price: string;
};

type CalculatedSaleItem = {
  estimatedUnitCost: number;
  productId: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
};

type IngredientJoin = {
  id: string;
  inventory_unit: string;
  name: string;
  stock_quantity: string;
  unit_cost: string;
};

type ProductCompositionRow = {
  product_id: string;
  ingredient_id: string;
  quantity: string;
  conversion_factor_to_inventory: string;
  ingredients?: IngredientJoin | IngredientJoin[] | null;
};

type SaleStockItem = {
  product_id: string | null;
  product_name: string;
  quantity: number | string;
};

type SaleStockMovementRow = {
  id: string;
  ingredient_id: string;
  quantity_delta: string;
  unit_cost: string | null;
};

type StockIngredientRow = {
  id: string;
  stock_quantity: string;
};

type StockPlan = {
  currentStock: number;
  ingredientId: string;
  ingredientName: string;
  inventoryUnit: string;
  newStock: number;
  quantityDelta: number;
  unitCost: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível processar a venda."
  );
}

function formatNumber(value: number) {
  return `#${String(value).padStart(6, "0")}`;
}

function getJoinedCustomer(row: SaleRow) {
  if (Array.isArray(row.customers)) {
    return row.customers[0] ?? null;
  }

  return row.customers ?? null;
}

function getJoinedBudget(row: SaleRow) {
  if (Array.isArray(row.budgets)) {
    return row.budgets[0] ?? null;
  }

  return row.budgets ?? null;
}

function getJoinedIngredient(row: ProductCompositionRow) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients[0] ?? null;
  }

  return row.ingredients ?? null;
}

function mapSale(row: SaleRow, itemRows: SaleItemRow[]) {
  const customer = getJoinedCustomer(row);
  const budget = getJoinedBudget(row);
  const number = Number(row.number);

  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customer: customer
      ? {
          address: customer.address,
          email: customer.email,
          id: customer.id,
          name: customer.name,
          phone: customer.phone
        }
      : null,
    budgetId: row.budget_id,
    budget: budget
      ? {
          id: budget.id,
          number: Number(budget.number),
          numberLabel: formatNumber(Number(budget.number)),
          status: budget.status
        }
      : null,
    number,
    numberLabel: formatNumber(number),
    status: row.status,
    subtotalAmount: Number(row.subtotal_amount),
    discountAmount: Number(row.discount_amount),
    totalAmount: Number(row.total_amount),
    estimatedProfit: Number(row.estimated_profit),
    soldAt: row.sold_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemRows.map((item) => ({
      estimatedUnitCost: Number(item.estimated_unit_cost),
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity),
      totalPrice: Number(item.total_price),
      unitPrice: Number(item.unit_price)
    }))
  };
}

@Injectable()
export class SalesService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly auditService: AuditService,
    private readonly financeService: FinanceService,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  async findAll(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data: sales, error } = await supabase
      .from("sales")
      .select(
        "id, company_id, customer_id, budget_id, number, status, subtotal_amount, discount_amount, total_amount, estimated_profit, sold_at, created_at, updated_at, customers(id, name, phone, email, address), budgets(id, number, status)"
      )
      .eq("company_id", companyId)
      .order("number", { ascending: false });

    if (error) {
      throwDatabaseError(error);
    }

    const saleRows = (sales ?? []) as SaleRow[];

    if (saleRows.length === 0) {
      return [];
    }

    const { data: items, error: itemsError } = await supabase
      .from("sale_items")
      .select(
        "id, sale_id, product_id, product_name, quantity, unit_price, total_price, estimated_unit_cost"
      )
      .eq("company_id", companyId)
      .in(
        "sale_id",
        saleRows.map((sale) => sale.id)
      );

    if (itemsError) {
      throwDatabaseError(itemsError);
    }

    const itemRows = (items ?? []) as SaleItemRow[];

    return saleRows.map((sale) =>
      mapSale(
        sale,
        itemRows.filter((item) => item.sale_id === sale.id)
      )
    );
  }

  async create(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateSaleDto
  ) {
    await this.subscriptionsService.assertCanCreate(
      companyId,
      "sales_per_month"
    );

    const supabase = this.supabaseFactory.createForUser(accessToken);

    await this.ensureCustomerExists(accessToken, companyId, dto.customerId);

    const calculatedItems = await this.calculateDirectItems(
      accessToken,
      companyId,
      dto.items
    );
    const totals = this.calculateDirectTotals(
      calculatedItems,
      dto.discountAmount ?? 0
    );
    const stockPlan = await this.buildStockPlan(
      accessToken,
      companyId,
      calculatedItems.map((item) => ({
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity
      }))
    );
    const number = await this.getNextSaleNumber(accessToken, companyId);
    const estimatedCost = roundMoney(
      calculatedItems.reduce((total, item) => {
        return total + item.quantity * item.estimatedUnitCost;
      }, 0)
    );
    const estimatedProfit = roundMoney(totals.totalAmount - estimatedCost);
    let saleId: string | null = null;
    const adjustedStocks: Array<{
      currentStock: number;
      ingredientId: string;
    }> = [];

    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          company_id: companyId,
          created_by: userId,
          customer_id: dto.customerId ?? null,
          discount_amount: totals.discountAmount,
          estimated_profit: estimatedProfit,
          number,
          subtotal_amount: totals.subtotalAmount,
          total_amount: totals.totalAmount
        })
        .select(
          "id, company_id, customer_id, budget_id, number, status, subtotal_amount, discount_amount, total_amount, estimated_profit, sold_at, created_at, updated_at, customers(id, name, phone, email), budgets(id, number, status)"
        )
        .single();

      if (error) {
        throwDatabaseError(error);
      }

      const saleRow = sale as SaleRow;
      saleId = saleRow.id;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        calculatedItems.map((item) => ({
          company_id: companyId,
          estimated_unit_cost: item.estimatedUnitCost,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          sale_id: saleRow.id,
          total_price: item.totalPrice,
          unit_price: item.unitPrice
        }))
      );

      if (itemsError) {
        throwDatabaseError(itemsError);
      }

      for (const plan of stockPlan) {
        const { data: updatedIngredient, error: stockError } = await supabase
          .from("ingredients")
          .update({
            stock_quantity: plan.newStock
          })
          .eq("company_id", companyId)
          .eq("id", plan.ingredientId)
          .select("id")
          .maybeSingle();

        if (stockError) {
          throwDatabaseError(stockError);
        }

        if (!updatedIngredient) {
          throw new BadRequestException(
            `Não foi possível atualizar o estoque de ${plan.ingredientName}.`
          );
        }

        adjustedStocks.push({
          currentStock: plan.currentStock,
          ingredientId: plan.ingredientId
        });
      }

      const { error: movementError } = await supabase
        .from("ingredient_stock_movements")
        .insert(
          stockPlan.map((plan) => ({
            company_id: companyId,
            created_by: userId,
            ingredient_id: plan.ingredientId,
            notes: `Venda ${formatNumber(number)}`,
            quantity_delta: -plan.quantityDelta,
            source_id: saleRow.id,
            source_type: "sale",
            type: "sale",
            unit_cost: plan.unitCost
          }))
        );

      if (movementError) {
        throwDatabaseError(movementError);
      }

      await this.financeService.syncSaleIncome(accessToken, companyId, userId, {
        number,
        saleId: saleRow.id,
        soldAt: saleRow.sold_at,
        totalAmount: totals.totalAmount
      });

      const savedSale = await this.findOne(accessToken, companyId, saleRow.id);

      await this.auditService.record({
        action: "sale.created",
        companyId,
        entityId: saleRow.id,
        entityType: "sale",
        metadata: {
          estimatedProfit,
          itemCount: calculatedItems.length,
          number,
          stockMovements: stockPlan.length,
          totalAmount: totals.totalAmount
        },
        userId
      });

      return savedSale;
    } catch (error) {
      await this.rollbackConversion(accessToken, companyId, saleId, adjustedStocks);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException("Não foi possível criar a venda.");
    }
  }

  async convertBudget(
    accessToken: string,
    companyId: string,
    userId: string,
    budgetId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const existingSale = await this.findByBudgetId(accessToken, companyId, budgetId);

    if (existingSale) {
      throw new BadRequestException("Este orçamento já foi convertido em venda.");
    }

    const budget = await this.getBudgetRow(accessToken, companyId, budgetId);

    if (budget.status !== "approved") {
      throw new BadRequestException(
        "Apenas orçamentos aprovados podem virar venda."
      );
    }

    const budgetItems = await this.getBudgetItems(accessToken, companyId, budgetId);

    if (budgetItems.length === 0) {
      throw new BadRequestException("O orçamento não possui itens.");
    }

    await this.subscriptionsService.assertCanCreate(
      companyId,
      "sales_per_month"
    );

    const stockPlan = await this.buildStockPlan(
      accessToken,
      companyId,
      budgetItems
    );
    const number = await this.getNextSaleNumber(accessToken, companyId);
    const estimatedCost = roundMoney(
      budgetItems.reduce((total, item) => {
        return total + Number(item.quantity) * Number(item.estimated_cost);
      }, 0)
    );
    const estimatedProfit = roundMoney(Number(budget.total_amount) - estimatedCost);
    let saleId: string | null = null;
    let budgetWasUpdated = false;
    const adjustedStocks: Array<{
      currentStock: number;
      ingredientId: string;
    }> = [];

    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          budget_id: budget.id,
          company_id: companyId,
          created_by: userId,
          customer_id: budget.customer_id,
          discount_amount: Number(budget.discount_amount),
          estimated_profit: estimatedProfit,
          number,
          subtotal_amount: Number(budget.subtotal_amount),
          total_amount: Number(budget.total_amount)
        })
        .select(
          "id, company_id, customer_id, budget_id, number, status, subtotal_amount, discount_amount, total_amount, estimated_profit, sold_at, created_at, updated_at, customers(id, name, phone, email), budgets(id, number, status)"
        )
        .single();

      if (error) {
        throwDatabaseError(error);
      }

      const saleRow = sale as SaleRow;
      saleId = saleRow.id;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        budgetItems.map((item) => ({
          company_id: companyId,
          estimated_unit_cost: Number(item.estimated_cost),
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: Number(item.quantity),
          sale_id: saleRow.id,
          total_price: Number(item.total_price),
          unit_price: Number(item.unit_price)
        }))
      );

      if (itemsError) {
        throwDatabaseError(itemsError);
      }

      for (const plan of stockPlan) {
        const { data: updatedIngredient, error: stockError } = await supabase
          .from("ingredients")
          .update({
            stock_quantity: plan.newStock
          })
          .eq("company_id", companyId)
          .eq("id", plan.ingredientId)
          .select("id")
          .maybeSingle();

        if (stockError) {
          throwDatabaseError(stockError);
        }

        if (!updatedIngredient) {
          throw new BadRequestException(
            `Não foi possível atualizar o estoque de ${plan.ingredientName}.`
          );
        }

        adjustedStocks.push({
          currentStock: plan.currentStock,
          ingredientId: plan.ingredientId
        });
      }

      const { error: movementError } = await supabase
        .from("ingredient_stock_movements")
        .insert(
          stockPlan.map((plan) => ({
            company_id: companyId,
            created_by: userId,
            ingredient_id: plan.ingredientId,
            notes: `Venda ${formatNumber(number)}`,
            quantity_delta: -plan.quantityDelta,
            source_id: saleRow.id,
            source_type: "sale",
            type: "sale",
            unit_cost: plan.unitCost
          }))
        );

      if (movementError) {
        throwDatabaseError(movementError);
      }

      await this.financeService.syncSaleIncome(accessToken, companyId, userId, {
        number,
        saleId: saleRow.id,
        soldAt: saleRow.sold_at,
        totalAmount: Number(budget.total_amount)
      });

      const { error: budgetError } = await supabase
        .from("budgets")
        .update({
          status: "converted"
        })
        .eq("company_id", companyId)
        .eq("id", budgetId);

      if (budgetError) {
        throwDatabaseError(budgetError);
      }

      budgetWasUpdated = true;

      const convertedSale = await this.findOne(
        accessToken,
        companyId,
        saleRow.id
      );

      await this.auditService.record({
        action: "sale.created_from_budget",
        companyId,
        entityId: saleRow.id,
        entityType: "sale",
        metadata: {
          budgetId: budget.id,
          budgetNumber: Number(budget.number),
          estimatedProfit,
          itemCount: budgetItems.length,
          number,
          stockMovements: stockPlan.length,
          totalAmount: Number(budget.total_amount)
        },
        userId
      });

      return convertedSale;
    } catch (error) {
      await this.rollbackConversion(
        accessToken,
        companyId,
        saleId,
        adjustedStocks,
        budgetWasUpdated
          ? {
              budgetId: budget.id,
              status: budget.status
            }
          : undefined
      );

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException("Não foi possível converter o orçamento.");
    }
  }

  async cancel(
    accessToken: string,
    companyId: string,
    userId: string,
    saleId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const sale = await this.getSaleRow(accessToken, companyId, saleId);

    if (sale.status !== "completed") {
      throw new BadRequestException("Apenas vendas concluídas podem ser canceladas.");
    }

    const existingReversal = await this.findSaleReversal(
      accessToken,
      companyId,
      saleId
    );

    if (existingReversal) {
      throw new BadRequestException("Esta venda já possui estorno registrado.");
    }

    const saleMovements = await this.getSaleStockMovements(
      accessToken,
      companyId,
      saleId
    );

    if (saleMovements.length === 0) {
      throw new BadRequestException(
        "Não foram encontradas baixas de estoque para esta venda."
      );
    }

    const restorationPlan = await this.buildRestorationPlan(
      accessToken,
      companyId,
      saleMovements
    );
    const restoredStocks: Array<{ currentStock: number; ingredientId: string }> =
      [];
    let reversalIds: string[] = [];
    let saleWasUpdated = false;
    let budgetWasUpdated = false;
    let financeRollback: FinanceTransactionRollback[] = [];

    try {
      for (const plan of restorationPlan) {
        const { data: updatedIngredient, error: stockError } = await supabase
          .from("ingredients")
          .update({
            stock_quantity: plan.newStock
          })
          .eq("company_id", companyId)
          .eq("id", plan.ingredientId)
          .select("id")
          .maybeSingle();

        if (stockError) {
          throwDatabaseError(stockError);
        }

        if (!updatedIngredient) {
          throw new BadRequestException("Não foi possível estornar o estoque.");
        }

        restoredStocks.push({
          currentStock: plan.currentStock,
          ingredientId: plan.ingredientId
        });
      }

      const { data: reversals, error: reversalError } = await supabase
        .from("ingredient_stock_movements")
        .insert(
          restorationPlan.map((plan) => ({
            company_id: companyId,
            created_by: userId,
            ingredient_id: plan.ingredientId,
            notes: `Estorno venda ${formatNumber(Number(sale.number))}`,
            quantity_delta: plan.quantityDelta,
            source_id: sale.id,
            source_type: "sale",
            type: "reversal",
            unit_cost: plan.unitCost
          }))
        )
        .select("id");

      if (reversalError) {
        throwDatabaseError(reversalError);
      }

      reversalIds = ((reversals ?? []) as Array<{ id: string }>).map(
        (reversal) => reversal.id
      );

      const { data: updatedSale, error: saleError } = await supabase
        .from("sales")
        .update({ status: "cancelled" })
        .eq("company_id", companyId)
        .eq("id", saleId)
        .select("id")
        .maybeSingle();

      if (saleError) {
        throwDatabaseError(saleError);
      }

      if (!updatedSale) {
        throw new NotFoundException("Venda não encontrada.");
      }

      saleWasUpdated = true;

      if (sale.budget_id) {
        const { error: budgetError } = await supabase
          .from("budgets")
          .update({ status: "approved" })
          .eq("company_id", companyId)
          .eq("id", sale.budget_id);

        if (budgetError) {
          throwDatabaseError(budgetError);
        }

        budgetWasUpdated = true;
      }

      financeRollback = await this.financeService.cancelSaleIncome(
        accessToken,
        companyId,
        saleId
      );

      const cancelledSale = await this.findOne(accessToken, companyId, saleId);

      await this.auditService.record({
        action: "sale.cancelled",
        companyId,
        entityId: saleId,
        entityType: "sale",
        metadata: {
          budgetId: sale.budget_id,
          number: Number(sale.number),
          restoredStockMovements: restorationPlan.length,
          totalAmount: Number(sale.total_amount)
        },
        userId
      });

      return cancelledSale;
    } catch (error) {
      await this.rollbackCancellation(accessToken, companyId, {
        budgetId: sale.budget_id,
        budgetWasUpdated,
        financeRollback,
        restoredStocks,
        reversalIds,
        saleId,
        saleWasUpdated
      });

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException("Não foi possível cancelar a venda.");
    }
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
      throw new BadRequestException("Cliente da venda não encontrado.");
    }
  }

  private async calculateDirectItems(
    accessToken: string,
    companyId: string,
    items: CreateSaleDto["items"]
  ): Promise<CalculatedSaleItem[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];

    if (productIds.length !== items.length) {
      throw new BadRequestException("Use cada produto apenas uma vez na venda.");
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
        "Um ou mais produtos da venda não foram encontrados."
      );
    }

    return items.map((item) => {
      const product = products.find((current) => current.id === item.productId);

      if (!product) {
        throw new BadRequestException("Produto da venda não encontrado.");
      }

      const unitPrice = item.unitPrice ?? Number(product.sale_price);
      const totalPrice = roundMoney(item.quantity * unitPrice);

      return {
        estimatedUnitCost: Number(product.estimated_cost),
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        totalPrice,
        unitPrice
      };
    });
  }

  private calculateDirectTotals(
    items: CalculatedSaleItem[],
    discountAmount: number
  ) {
    const subtotalAmount = roundMoney(
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

  private async findByBudgetId(
    accessToken: string,
    companyId: string,
    budgetId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .eq("budget_id", budgetId)
      .eq("status", "completed")
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    return (data as { id: string } | null) ?? null;
  }

  private async getSaleRow(
    accessToken: string,
    companyId: string,
    saleId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("sales")
      .select(
        "id, company_id, customer_id, budget_id, number, status, subtotal_amount, discount_amount, total_amount, estimated_profit, sold_at, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("id", saleId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Venda não encontrada.");
    }

    return data as SaleRow;
  }

  private async findSaleReversal(
    accessToken: string,
    companyId: string,
    saleId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredient_stock_movements")
      .select("id")
      .eq("company_id", companyId)
      .eq("source_type", "sale")
      .eq("source_id", saleId)
      .eq("type", "reversal")
      .limit(1);

    if (error) {
      throwDatabaseError(error);
    }

    return (data?.[0] as { id: string } | undefined) ?? null;
  }

  private async getSaleStockMovements(
    accessToken: string,
    companyId: string,
    saleId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredient_stock_movements")
      .select("id, ingredient_id, quantity_delta, unit_cost")
      .eq("company_id", companyId)
      .eq("source_type", "sale")
      .eq("source_id", saleId)
      .eq("type", "sale");

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as SaleStockMovementRow[];
  }

  private async buildRestorationPlan(
    accessToken: string,
    companyId: string,
    movements: SaleStockMovementRow[]
  ) {
    const ingredientIds = [
      ...new Set(movements.map((movement) => movement.ingredient_id))
    ];
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredients")
      .select("id, stock_quantity")
      .eq("company_id", companyId)
      .in("id", ingredientIds);

    if (error) {
      throwDatabaseError(error);
    }

    const ingredients = (data ?? []) as StockIngredientRow[];

    if (ingredients.length !== ingredientIds.length) {
      throw new BadRequestException(
        "Um ou mais insumos do estorno não foram encontrados."
      );
    }

    return movements.map((movement) => {
      const ingredient = ingredients.find(
        (current) => current.id === movement.ingredient_id
      );

      if (!ingredient) {
        throw new BadRequestException("Insumo do estorno não encontrado.");
      }

      const currentStock = Number(ingredient.stock_quantity);
      const quantityDelta = roundQuantity(-Number(movement.quantity_delta));

      if (quantityDelta <= 0) {
        throw new BadRequestException("Movimentacao de venda invalida.");
      }

      return {
        currentStock,
        ingredientId: ingredient.id,
        newStock: roundQuantity(currentStock + quantityDelta),
        quantityDelta,
        unitCost:
          movement.unit_cost === null ? null : Number(movement.unit_cost)
      };
    });
  }

  async findOne(accessToken: string, companyId: string, saleId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data: sale, error } = await supabase
      .from("sales")
      .select(
        "id, company_id, customer_id, budget_id, number, status, subtotal_amount, discount_amount, total_amount, estimated_profit, sold_at, created_at, updated_at, customers(id, name, phone, email, address), budgets(id, number, status)"
      )
      .eq("company_id", companyId)
      .eq("id", saleId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!sale) {
      throw new NotFoundException("Venda não encontrada.");
    }

    const { data: items, error: itemsError } = await supabase
      .from("sale_items")
      .select(
        "id, sale_id, product_id, product_name, quantity, unit_price, total_price, estimated_unit_cost"
      )
      .eq("company_id", companyId)
      .eq("sale_id", saleId);

    if (itemsError) {
      throwDatabaseError(itemsError);
    }

    return mapSale(sale as SaleRow, (items ?? []) as SaleItemRow[]);
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
        "id, company_id, customer_id, number, status, subtotal_amount, discount_amount, total_amount"
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

  private async getBudgetItems(
    accessToken: string,
    companyId: string,
    budgetId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("budget_items")
      .select(
        "id, budget_id, product_id, product_name, quantity, unit_price, total_price, estimated_cost"
      )
      .eq("company_id", companyId)
      .eq("budget_id", budgetId);

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []) as BudgetItemRow[];
  }

  private async buildStockPlan(
    accessToken: string,
    companyId: string,
    stockItems: SaleStockItem[]
  ): Promise<StockPlan[]> {
    const productIds = [
      ...new Set(
        stockItems
          .map((item) => item.product_id)
          .filter((productId): productId is string => Boolean(productId))
      )
    ];

    if (productIds.length !== stockItems.length) {
      throw new BadRequestException(
        "Todos os itens da venda precisam estar vinculados a produtos."
      );
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("product_items")
      .select(
        "product_id, ingredient_id, quantity, conversion_factor_to_inventory, ingredients(id, name, inventory_unit, stock_quantity, unit_cost)"
      )
      .eq("company_id", companyId)
      .in("product_id", productIds);

    if (error) {
      throwDatabaseError(error);
    }

    const compositionRows = (data ?? []) as ProductCompositionRow[];
    const stockMap = new Map<string, StockPlan>();

    for (const stockItem of stockItems) {
      const productComposition = compositionRows.filter(
        (item) => item.product_id === stockItem.product_id
      );

      if (productComposition.length === 0) {
        throw new BadRequestException(
          `Produto sem composição: ${stockItem.product_name}.`
        );
      }

      for (const composition of productComposition) {
        const ingredient = getJoinedIngredient(composition);

        if (!ingredient) {
          throw new BadRequestException(
            `Insumo não encontrado na composição de ${stockItem.product_name}.`
          );
        }

        const consumedQuantity = roundQuantity(
          Number(stockItem.quantity) *
            Number(composition.quantity) *
            Number(composition.conversion_factor_to_inventory)
        );
        const current = stockMap.get(ingredient.id);

        if (current) {
          current.quantityDelta = roundQuantity(
            current.quantityDelta + consumedQuantity
          );
          current.newStock = roundQuantity(
            current.currentStock - current.quantityDelta
          );
        } else {
          stockMap.set(ingredient.id, {
            currentStock: Number(ingredient.stock_quantity),
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            inventoryUnit: ingredient.inventory_unit,
            newStock: roundQuantity(
              Number(ingredient.stock_quantity) - consumedQuantity
            ),
            quantityDelta: consumedQuantity,
            unitCost: Number(ingredient.unit_cost)
          });
        }
      }
    }

    const stockPlan = [...stockMap.values()];
    const insufficient = stockPlan.find((plan) => plan.newStock < 0);

    if (insufficient) {
      const missingQuantity = roundQuantity(Math.abs(insufficient.newStock));
      throw new BadRequestException(
        `Estoque insuficiente para ${insufficient.ingredientName}. Necessario: ${insufficient.quantityDelta} ${insufficient.inventoryUnit}. Disponivel: ${insufficient.currentStock} ${insufficient.inventoryUnit}. Falta: ${missingQuantity} ${insufficient.inventoryUnit}.`
      );
    }

    return stockPlan;
  }

  private async getNextSaleNumber(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("sales")
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

  private async rollbackConversion(
    accessToken: string,
    companyId: string,
    saleId: string | null,
    adjustedStocks: Array<{ currentStock: number; ingredientId: string }>,
    budgetRollback?: { budgetId: string; status: BudgetStatus }
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    if (budgetRollback) {
      await supabase
        .from("budgets")
        .update({ status: budgetRollback.status })
        .eq("company_id", companyId)
        .eq("id", budgetRollback.budgetId);
    }

    for (const stock of [...adjustedStocks].reverse()) {
      await supabase
        .from("ingredients")
        .update({ stock_quantity: stock.currentStock })
        .eq("company_id", companyId)
        .eq("id", stock.ingredientId);
    }

    if (saleId) {
      await this.financeService.deleteSaleTransactions(
        accessToken,
        companyId,
        saleId
      );

      await supabase
        .from("ingredient_stock_movements")
        .delete()
        .eq("company_id", companyId)
        .eq("source_type", "sale")
        .eq("source_id", saleId);

      await supabase
        .from("sales")
        .delete()
        .eq("company_id", companyId)
        .eq("id", saleId);
    }
  }

  private async rollbackCancellation(
    accessToken: string,
    companyId: string,
    context: {
      budgetId: string | null;
      budgetWasUpdated: boolean;
      financeRollback: FinanceTransactionRollback[];
      restoredStocks: Array<{ currentStock: number; ingredientId: string }>;
      reversalIds: string[];
      saleId: string;
      saleWasUpdated: boolean;
    }
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);

    await this.financeService.restoreTransactions(
      accessToken,
      companyId,
      context.financeRollback
    );

    if (context.budgetWasUpdated && context.budgetId) {
      await supabase
        .from("budgets")
        .update({ status: "converted" })
        .eq("company_id", companyId)
        .eq("id", context.budgetId);
    }

    if (context.saleWasUpdated) {
      await supabase
        .from("sales")
        .update({ status: "completed" })
        .eq("company_id", companyId)
        .eq("id", context.saleId);
    }

    if (context.reversalIds.length > 0) {
      await supabase
        .from("ingredient_stock_movements")
        .delete()
        .eq("company_id", companyId)
        .in("id", context.reversalIds);
    }

    for (const stock of [...context.restoredStocks].reverse()) {
      await supabase
        .from("ingredients")
        .update({ stock_quantity: stock.currentStock })
        .eq("company_id", companyId)
        .eq("id", stock.ingredientId);
    }
  }
}
