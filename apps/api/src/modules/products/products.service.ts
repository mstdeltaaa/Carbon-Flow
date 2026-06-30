import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { SupabaseClientFactory } from "../../common/supabase/supabase-client.factory";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ProductItemDto } from "./dto/product-item.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

type ProductRow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  estimated_cost: string;
  suggested_price: string;
  sale_price: string;
  margin_percent: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type IngredientRow = {
  id: string;
  inventory_unit: string;
  minimum_stock?: string | null;
  name: string;
  stock_quantity?: string | null;
  unit_cost: string;
};

type ProductItemRow = {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: string;
  unit: string;
  conversion_factor_to_inventory: string;
  ingredients?: IngredientRow | IngredientRow[] | null;
};

type CalculatedItem = {
  conversionFactorToInventory: number;
  ingredient: IngredientRow;
  ingredientId: string;
  quantity: number;
  unit: string;
};

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function throwDatabaseError(error: { message?: string }): never {
  throw new BadRequestException(
    error.message ?? "Não foi possível processar o produto."
  );
}

function getJoinedIngredient(row: ProductItemRow) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients[0] ?? null;
  }

  return row.ingredients ?? null;
}

function mapProduct(row: ProductRow, itemRows: ProductItemRow[]) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    estimatedCost: Number(row.estimated_cost),
    suggestedPrice: Number(row.suggested_price),
    salePrice: Number(row.sale_price),
    marginPercent: Number(row.margin_percent),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemRows.map((item) => {
      const ingredient = getJoinedIngredient(item);
      const conversionFactorToInventory = Number(
        item.conversion_factor_to_inventory
      );
      const ingredientUnitCost = Number(ingredient?.unit_cost ?? 0);
      const ingredientStockQuantity = Number(ingredient?.stock_quantity ?? 0);
      const ingredientMinimumStock = Number(ingredient?.minimum_stock ?? 0);
      const quantity = Number(item.quantity);
      const inventoryQuantity = quantity * conversionFactorToInventory;

      return {
        id: item.id,
        ingredientId: item.ingredient_id,
        ingredientName: ingredient?.name ?? "Insumo",
        ingredientUnit: ingredient?.inventory_unit ?? item.unit,
        ingredientUnitCost,
        ingredientStockQuantity,
        ingredientMinimumStock,
        inventoryQuantity,
        lineCost: roundMoney(inventoryQuantity * ingredientUnitCost),
        quantity,
        unit: item.unit,
        conversionFactorToInventory,
        isIngredientLowStock: ingredientStockQuantity <= ingredientMinimumStock
      };
    })
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly supabaseFactory: SupabaseClientFactory,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  async findAll(accessToken: string, companyId: string, role?: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const isSeller = role === "seller";

    const { data: products, error } = await supabase
      .from("products")
      .select(
        isSeller
          ? "id, company_id, name, description, sku, sale_price, is_active, created_at, updated_at"
          : "id, company_id, name, description, sku, estimated_cost, suggested_price, sale_price, margin_percent, is_active, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throwDatabaseError(error);
    }

    const productRows = ((products ?? []) as Partial<ProductRow>[]).map(
      (product) =>
        ({
          ...product,
          estimated_cost: product.estimated_cost ?? "0",
          margin_percent: product.margin_percent ?? "0",
          suggested_price: product.suggested_price ?? product.sale_price ?? "0"
        }) as ProductRow
    );

    if (productRows.length === 0) {
      return [];
    }

    if (isSeller) {
      return productRows.map((product) => mapProduct(product, []));
    }

    const { data: items, error: itemsError } = await supabase
      .from("product_items")
      .select(
        "id, product_id, ingredient_id, quantity, unit, conversion_factor_to_inventory, ingredients(id, name, inventory_unit, unit_cost, stock_quantity, minimum_stock)"
      )
      .eq("company_id", companyId)
      .in(
        "product_id",
        productRows.map((product) => product.id)
      );

    if (itemsError) {
      throwDatabaseError(itemsError);
    }

    const itemRows = (items ?? []) as ProductItemRow[];

    return productRows.map((product) =>
      mapProduct(
        product,
        itemRows.filter((item) => item.product_id === product.id)
      )
    );
  }

  async create(
    accessToken: string,
    companyId: string,
    userId: string,
    dto: CreateProductDto
  ) {
    await this.subscriptionsService.assertCanCreate(companyId, "products");

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const calculatedItems = await this.calculateItems(
      accessToken,
      companyId,
      dto.items
    );
    const marginPercent = dto.marginPercent ?? 30;
    const estimatedCost = this.calculateCost(calculatedItems);
    const suggestedPrice = roundMoney(
      estimatedCost * (1 + marginPercent / 100)
    );
    const salePrice = dto.salePrice ?? suggestedPrice;

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        company_id: companyId,
        created_by: userId,
        description: normalizeText(dto.description),
        estimated_cost: estimatedCost,
        margin_percent: marginPercent,
        name: dto.name.trim(),
        sale_price: salePrice,
        sku: normalizeText(dto.sku),
        suggested_price: suggestedPrice
      })
      .select(
        "id, company_id, name, description, sku, estimated_cost, suggested_price, sale_price, margin_percent, is_active, created_at, updated_at"
      )
      .single();

    if (error) {
      throwDatabaseError(error);
    }

    const productRow = product as ProductRow;
    const { error: itemsError } = await supabase.from("product_items").insert(
      calculatedItems.map((item) => ({
        company_id: companyId,
        conversion_factor_to_inventory: item.conversionFactorToInventory,
        ingredient_id: item.ingredientId,
        product_id: productRow.id,
        quantity: item.quantity,
        unit: item.unit
      }))
    );

    if (itemsError) {
      await supabase.from("products").delete().eq("id", productRow.id);
      throwDatabaseError(itemsError);
    }

    return this.findOne(accessToken, companyId, productRow.id);
  }

  async update(
    accessToken: string,
    companyId: string,
    productId: string,
    dto: UpdateProductDto
  ) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const payload: Record<string, unknown> = {};
    let calculatedItems: CalculatedItem[] | null = null;

    if (dto.items !== undefined) {
      calculatedItems = await this.calculateItems(
        accessToken,
        companyId,
        dto.items
      );
      const marginPercent = dto.marginPercent ?? 30;
      const estimatedCost = this.calculateCost(calculatedItems);

      payload.estimated_cost = estimatedCost;
      payload.margin_percent = marginPercent;
      payload.suggested_price = roundMoney(
        estimatedCost * (1 + marginPercent / 100)
      );
      payload.sale_price = dto.salePrice ?? payload.suggested_price;
    }

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      payload.description = normalizeText(dto.description);
    }

    if (dto.sku !== undefined) {
      payload.sku = normalizeText(dto.sku);
    }

    if (dto.marginPercent !== undefined && calculatedItems === null) {
      payload.margin_percent = dto.marginPercent;
    }

    if (dto.salePrice !== undefined && calculatedItems === null) {
      payload.sale_price = dto.salePrice;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    const { data: product, error } = await supabase
      .from("products")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", productId)
      .select(
        "id, company_id, name, description, sku, estimated_cost, suggested_price, sale_price, margin_percent, is_active, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!product) {
      throw new NotFoundException("Produto não encontrado.");
    }

    if (calculatedItems) {
      const { error: deleteError } = await supabase
        .from("product_items")
        .delete()
        .eq("company_id", companyId)
        .eq("product_id", productId);

      if (deleteError) {
        throwDatabaseError(deleteError);
      }

      const { error: insertError } = await supabase
        .from("product_items")
        .insert(
          calculatedItems.map((item) => ({
            company_id: companyId,
            conversion_factor_to_inventory: item.conversionFactorToInventory,
            ingredient_id: item.ingredientId,
            product_id: productId,
            quantity: item.quantity,
            unit: item.unit
          }))
        );

      if (insertError) {
        throwDatabaseError(insertError);
      }
    }

    return this.findOne(accessToken, companyId, productId);
  }

  async deactivate(accessToken: string, companyId: string, productId: string) {
    return this.update(accessToken, companyId, productId, {
      isActive: false
    });
  }

  async findOne(accessToken: string, companyId: string, productId: string) {
    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data: product, error } = await supabase
      .from("products")
      .select(
        "id, company_id, name, description, sku, estimated_cost, suggested_price, sale_price, margin_percent, is_active, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("id", productId)
      .maybeSingle();

    if (error) {
      throwDatabaseError(error);
    }

    if (!product) {
      throw new NotFoundException("Produto não encontrado.");
    }

    const { data: items, error: itemsError } = await supabase
      .from("product_items")
      .select(
        "id, product_id, ingredient_id, quantity, unit, conversion_factor_to_inventory, ingredients(id, name, inventory_unit, unit_cost, stock_quantity, minimum_stock)"
      )
      .eq("company_id", companyId)
      .eq("product_id", productId);

    if (itemsError) {
      throwDatabaseError(itemsError);
    }

    return mapProduct(product as ProductRow, (items ?? []) as ProductItemRow[]);
  }

  private async calculateItems(
    accessToken: string,
    companyId: string,
    items: ProductItemDto[]
  ): Promise<CalculatedItem[]> {
    const ingredientIds = [...new Set(items.map((item) => item.ingredientId))];

    if (ingredientIds.length !== items.length) {
      throw new BadRequestException("Não repita o mesmo insumo na composição.");
    }

    const supabase = this.supabaseFactory.createForUser(accessToken);
    const { data, error } = await supabase
      .from("ingredients")
      .select("id, name, inventory_unit, unit_cost")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("id", ingredientIds);

    if (error) {
      throwDatabaseError(error);
    }

    const ingredients = (data ?? []) as IngredientRow[];

    if (ingredients.length !== ingredientIds.length) {
      throw new BadRequestException(
        "Um ou mais insumos da composição não foram encontrados."
      );
    }

    return items.map((item) => {
      const ingredient = ingredients.find(
        (current) => current.id === item.ingredientId
      );

      if (!ingredient) {
        throw new BadRequestException("Insumo da composição não encontrado.");
      }

      return {
        conversionFactorToInventory: item.conversionFactorToInventory ?? 1,
        ingredient,
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unit: item.unit?.trim() || ingredient.inventory_unit
      };
    });
  }

  private calculateCost(items: CalculatedItem[]) {
    return roundMoney(
      items.reduce((total, item) => {
        return (
          total +
          item.quantity *
            item.conversionFactorToInventory *
            Number(item.ingredient.unit_cost)
        );
      }, 0)
    );
  }
}
