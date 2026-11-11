/**
 * Modifier recipes are shared by the modifier itself, not by each product.
 * The product recipe screen replaces only product and size lines.
 * Modifier lines stay, and are edited from the modifier screen.
 */
export interface ProductRecipeLine {
  inventoryItemId: string;
  productSizeId?: string | null;
  modifierId?: string | null;
  quantity: number;
}

export function productOwnedRecipeFilter(productId: string, sizeIds: string[]) {
  return {
    modifierId: null,
    OR: [
      { productId },
      { productSizeId: { in: sizeIds } },
    ],
  };
}

export function productOwnedRecipeRows(productId: string, items: ProductRecipeLine[]) {
  return items
    .filter((item) => !item.modifierId)
    .map((item) => ({
      inventoryItemId: item.inventoryItemId,
      productId: !item.productSizeId ? productId : null,
      productSizeId: item.productSizeId ?? null,
      modifierId: null,
      quantity: item.quantity,
    }));
}