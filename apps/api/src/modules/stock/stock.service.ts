import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { AuditService } from "../audit/audit.service";
import { CreateStockMovementDto } from "./dto/create-stock-movement.dto";

type IngredientRow = {
  id: string;
  company_id: string;
  name: string;
  category: string | null;
  inventory_unit: string;
  unit_cost: string;
  stock_quantity: string;
  minimum_stock: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MovementIngredientJoin = {
  id: string;
  inventory_unit: string;
  name: string;
};

type MovementRow = {
  id: string;
  company_id: string;
  ingredient_id: string;
  type: "entry" | "sale" | "adjustment" | "reversal";
  quantity_delta: string;
  unit_cost: string | null;
  source_type: string | null;
  source_id: string | null;
  notes: string | null;
  created_at: string;
  ingredients?: MovementIngredientJoin | MovementIngredientJoin[] | null;
};

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível processar o estoque."
  );
}

function getJoinedIngredient(row: MovementRow) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients[0] ?? null;
  }

  return row.ingredients ?? null;
}

function mapIngredient(row: IngredientRow) {
  const stockQuantity = Number(row.stock_quantity);
  const minimumStock = Number(row.minimum_stock);
  const unitCost = Number(row.unit_cost);

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    category: row.category,
    inventoryUnit: row.inventory_unit,
    unitCost,
    stockQuantity,
    minimumStock,
    stockValue: Math.round((stockQuantity * unitCost + Number.EPSILON) * 100) / 100,
    isLowStock: stockQuantity <= minimumStock,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMovement(row: MovementRow) {
  const ingredient = getJoinedIngredient(row);

  return {
    id: row.id,
    companyId: row.company_id,
    ingredientId: row.ingredient_id,
    ingredientName: ingredient?.name ?? "Insumo",
    ingredientUnit: ingredient?.inventory_unit ?? "",
    type: row.type,
    quantityDelta: Number(row.quantity_delta),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    sourceType: row.source_type,
    sourceId: row.source_id,
    notes: row.notes,
    createdAt: row.created_at
  };
}

@Injectable()
export class StockService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly auditService: AuditService
  ) {}

  async findItems(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredients")
      .select(
        "id, company_id, name, category, inventory_unit, unit_cost, stock_quantity, minimum_stock, is_active, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []).map((row) => mapIngredient(row as IngredientRow));
  }

  async findMovements(accessToken: string, companyId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredient_stock_movements")
      .select(
        "id, company_id, ingredient_id, type, quantity_delta, unit_cost, source_type, source_id, notes, created_at, ingredients(id, name, inventory_unit)"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throwDatabaseError(error);
    }

    return (data ?? []).map((row) => mapMovement(row as MovementRow));
  }

  async createMovement(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateStockMovementDto
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const ingredient = await this.getIngredient(
      accessToken,
      companyId,
      dto.ingredientId
    );
    const currentStock = Number(ingredient.stock_quantity);
    const quantityDelta =
      dto.type === "entry"
        ? roundQuantity(dto.quantity)
        : roundQuantity(dto.quantity - currentStock);

    if (quantityDelta === 0) {
      throw new BadRequestException("A movimentacao precisa alterar o estoque.");
    }

    const nextStock = roundQuantity(currentStock + quantityDelta);

    if (nextStock < 0) {
      throw new BadRequestException("O estoque não pode ficar negativo.");
    }

    const movementUnitCost = dto.unitCost ?? Number(ingredient.unit_cost);
    const updatePayload: Record<string, unknown> = {
      stock_quantity: nextStock
    };

    if (dto.unitCost !== undefined && dto.type === "entry") {
      updatePayload.unit_cost = dto.unitCost;
    }

    const { data: updatedIngredient, error: updateError } = await supabase
      .from("ingredients")
      .update(updatePayload)
      .eq("company_id", companyId)
      .eq("id", ingredient.id)
      .select(
        "id, company_id, name, category, inventory_unit, unit_cost, stock_quantity, minimum_stock, is_active, created_at, updated_at"
      )
      .maybeSingle();

    if (updateError) {
      throwDatabaseError(updateError);
    }

    if (!updatedIngredient) {
      throw new NotFoundException("Insumo não encontrado.");
    }

    const { data: movement, error: movementError } = await supabase
      .from("ingredient_stock_movements")
      .insert({
        company_id: companyId,
        created_by: userId,
        ingredient_id: ingredient.id,
        notes: normalizeText(dto.notes),
        quantity_delta: quantityDelta,
        source_type: "manual",
        type: dto.type,
        unit_cost: movementUnitCost
      })
      .select(
        "id, company_id, ingredient_id, type, quantity_delta, unit_cost, source_type, source_id, notes, created_at, ingredients(id, name, inventory_unit)"
      )
      .single();

    if (movementError) {
      await supabase
        .from("ingredients")
        .update({
          stock_quantity: currentStock,
          unit_cost: Number(ingredient.unit_cost)
        })
        .eq("company_id", companyId)
        .eq("id", ingredient.id);
      throwDatabaseError(movementError);
    }

    const result = {
      item: mapIngredient(updatedIngredient as IngredientRow),
      movement: mapMovement(movement as MovementRow)
    };

    await this.auditService.record({
      action:
        dto.type === "entry" ? "stock.entry_created" : "stock.adjustment_created",
      companyId,
      entityId: result.movement.id,
      entityType: "stock_movement",
      metadata: {
        currentStock,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        nextStock,
        quantityDelta,
        type: dto.type,
        unit: ingredient.inventory_unit,
        unitCost: movementUnitCost
      },
      userId
    });

    return result;
  }

  private async getIngredient(
    accessToken: string,
    companyId: string,
    ingredientId: string
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredients")
      .select(
        "id, company_id, name, category, inventory_unit, unit_cost, stock_quantity, minimum_stock, is_active, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("id", ingredientId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Insumo não encontrado.");
    }

    return data as IngredientRow;
  }
}
