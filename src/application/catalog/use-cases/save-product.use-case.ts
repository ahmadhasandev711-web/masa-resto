import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { ProductInput, productSchema, toMinorUnits } from '../dto/catalog.dto';

export class SaveProductUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: ProductInput) {
    const value = productSchema.parse(input);
    const { sizes, modifierGroupIds, ...fields } = value;
    const productId = value.id;

    const baseData = {
      categoryId: fields.categoryId,
      nameAr: fields.nameAr,
      nameEn: fields.nameEn,
      description: fields.description || null,
      imageUrl: fields.imageUrl || null,
      isFeatured: fields.isFeatured ?? false,
    };

    const modifierGroupCreate = modifierGroupIds.map((groupId, sortOrder) => ({
      groupId,
      sortOrder,
    }));

    return this.db.$transaction(async (transaction) => {
      if (productId) {
        // Fetch existing sizes for this product
        const existingSizes = await transaction.productSize.findMany({
          where: { productId },
        });
        const existingSizeIds = new Set(existingSizes.map((s) => s.id));
        const incomingSizeIds = new Set(sizes.map((s) => s.id).filter(Boolean) as string[]);

        // 1. Upsert incoming sizes (update existing, create new)
        for (let sortOrder = 0; sortOrder < sizes.length; sortOrder++) {
          const size = sizes[sortOrder];
          if (size.id && existingSizeIds.has(size.id)) {
            await transaction.productSize.update({
              where: { id: size.id },
              data: {
                nameAr: size.nameAr,
                nameEn: size.nameEn,
                price: toMinorUnits(size.price),
                sortOrder,
                isActive: true,
              },
            });
          } else {
            await transaction.productSize.create({
              data: {
                productId,
                nameAr: size.nameAr,
                nameEn: size.nameEn,
                price: toMinorUnits(size.price),
                sortOrder,
                isActive: true,
              },
            });
          }
        }

        // 2. Mark removed sizes as isActive = false (NEVER delete, preserving BOM recipes and history)
        const removedSizeIds = existingSizes
          .filter((s) => !incomingSizeIds.has(s.id))
          .map((s) => s.id);
        if (removedSizeIds.length > 0) {
          await transaction.productSize.updateMany({
            where: { id: { in: removedSizeIds } },
            data: { isActive: false },
          });
        }

        // 3. Update base product data and modifier groups
        await transaction.product.update({
          where: { id: productId },
          data: {
            ...baseData,
            modifierGroups: {
              deleteMany: {},
              create: modifierGroupCreate,
            },
          },
        });

        return transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: { sizes: true },
        });
      }

      // Creating new product
      return transaction.product.create({
        data: {
          ...baseData,
          modifierGroups: {
            create: modifierGroupCreate,
          },
          sizes: {
            create: sizes.map((size, sortOrder) => ({
              nameAr: size.nameAr,
              nameEn: size.nameEn,
              price: toMinorUnits(size.price),
              sortOrder,
              isActive: true,
            })),
          },
        },
        include: { sizes: true },
      });
    });
  }
}
