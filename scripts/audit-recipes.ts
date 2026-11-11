/**
 * scripts/audit-recipes.ts
 *
 * READ-ONLY audit tool that inspects product recipes across the catalog.
 * Prints:
 * 1. Products that have recipes defined at product-level only, but NO recipes for their sizes.
 * 2. Products that have NO recipes at all (optional BOM, no inventory deduction).
 *
 * Strictly read-only: does NOT mutate or delete any data.
 */

import { prisma } from '../src/infrastructure/db/prisma';

async function main() {
  console.log('=== [AUDIT] Starting Catalog BOM Recipes Audit (Read-Only) ===\n');

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: {
      sizes: {
        where: { isActive: true },
      },
      recipeItems: {
        include: {
          inventoryItem: true,
        },
      },
    },
    orderBy: { nameAr: 'asc' },
  });

  console.log(`Found ${products.length} active products in catalog.\n`);

  let countNoRecipes = 0;
  let countProductLevelOnly = 0;
  let countHealthy = 0;

  for (const product of products) {
    const totalRecipeItems = product.recipeItems.length;

    if (totalRecipeItems === 0) {
      countNoRecipes++;
      console.log(`[NO RECIPE] Product: "${product.nameAr}" (${product.nameEn}) [ID: ${product.id}]`);
      console.log(`  -> Has 0 recipe items. Sales of this product will not deduct inventory (Optional BOM).`);
      continue;
    }

    const productLevelRecipes = product.recipeItems.filter((r) => r.productSizeId === null);
    const sizeLevelRecipes = product.recipeItems.filter((r) => r.productSizeId !== null);

    if (product.sizes.length > 0 && productLevelRecipes.length > 0 && sizeLevelRecipes.length === 0) {
      countProductLevelOnly++;
      console.warn(`[WARNING: PRODUCT-LEVEL ONLY] Product: "${product.nameAr}" (${product.nameEn}) [ID: ${product.id}]`);
      console.warn(`  -> Has ${productLevelRecipes.length} product-level recipe items, but 0 size-specific recipes for its ${product.sizes.length} sizes:`);
      for (const size of product.sizes) {
        console.warn(`     - Size: "${size.nameAr}" [ID: ${size.id}] has no dedicated recipe`);
      }
      continue;
    }

    countHealthy++;
  }

  console.log('\n=== [AUDIT SUMMARY] ===');
  console.log(`Total Products Inspected: ${products.length}`);
  console.log(`Healthy Products with Recipes: ${countHealthy}`);
  console.log(`Products without any Recipes: ${countNoRecipes}`);
  console.log(`Products with Product-Level recipes only (missing size recipes): ${countProductLevelOnly}`);
  console.log('=== [AUDIT COMPLETE - ZERO MUTATIONS PERFORMED] ===\n');
}

main()
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
