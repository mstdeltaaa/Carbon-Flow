import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { CreateIngredientDto } from "./dto/create-ingredient.dto";
import { UpdateIngredientDto } from "./dto/update-ingredient.dto";

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

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function mapIngredient(row: IngredientRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    category: row.category,
    inventoryUnit: row.inventory_unit,
    unitCost: Number(row.unit_cost),
    stockQuantity: Number(row.stock_quantity),
    minimumStock: Number(row.minimum_stock),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Nao foi possivel processar o insumo."
  );
}

@Injectable()
export class IngredientsService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  async findAll(accessToken: string, companyId: string) {
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

  async create(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateIngredientDto
  ) {
    await this.subscriptionsService.assertCanCreate(companyId, "ingredients");

    const supabase = this.supabaseFactory.createForUser(accessToken);

    const { data, error } = await supabase
      .from("ingredients")
      .insert({
        category: normalizeText(dto.category),
        company_id: companyId,
        created_by: userId,
        inventory_unit: dto.inventoryUnit.trim(),
        minimum_stock: dto.minimumStock,
        name: dto.name.trim(),
        stock_quantity: dto.stockQuantity,
        unit_cost: dto.unitCost
      })
      .select(
        "id, company_id, name, category, inventory_unit, unit_cost, stock_quantity, minimum_stock, is_active, created_at, updated_at"
      )
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    return mapIngredient(data as IngredientRow);
  }

  async update(
    accessToken: string,
    companyId: string,
    ingredientId: string,
    dto: UpdateIngredientDto
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const payload: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.category !== undefined) {
      payload.category = normalizeText(dto.category);
    }

    if (dto.inventoryUnit !== undefined) {
      payload.inventory_unit = dto.inventoryUnit.trim();
    }

    if (dto.unitCost !== undefined) {
      payload.unit_cost = dto.unitCost;
    }

    if (dto.stockQuantity !== undefined) {
      payload.stock_quantity = dto.stockQuantity;
    }

    if (dto.minimumStock !== undefined) {
      payload.minimum_stock = dto.minimumStock;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    const { data, error } = await supabase
      .from("ingredients")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", ingredientId)
      .select(
        "id, company_id, name, category, inventory_unit, unit_cost, stock_quantity, minimum_stock, is_active, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundException("Insumo nao encontrado.");
    }

    return mapIngredient(data as IngredientRow);
  }

  async deactivate(accessToken: string, companyId: string, ingredientId: string) {
    return this.update(accessToken, companyId, ingredientId, {
      isActive: false
    });
  }
}
