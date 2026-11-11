import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { CatalogResource } from '../../../domain/catalog/enums/catalog-resource.enum';
import { ValidationError, NotFoundError } from '../../../domain/shared/errors/domain-error';
import { z } from 'zod';

const inputSchema = z.object({
  resource: z.nativeEnum(CatalogResource),
  id: z.string().min(1),
  isActive: z.boolean(),
});

export class SetCatalogStatusUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: unknown): Promise<{ id: string; isActive: boolean }> {
    const value = inputSchema.parse(input);

    if (value.resource === CatalogResource.CATEGORY) {
      const existing = await this.db.category.findUnique({ where: { id: value.id } });
      if (!existing) throw new NotFoundError('التصنيف', value.id);
      if (existing.deletedAt !== null) {
        throw new ValidationError('لا يمكن تفعيل أو تعديل حالة عنصر محذوف');
      }
      const updated = await this.db.category.update({
        where: { id: value.id },
        data: { isActive: value.isActive },
      });
      return { id: updated.id, isActive: updated.isActive };
    }

    if (value.resource === CatalogResource.PRODUCT) {
      const existing = await this.db.product.findUnique({ where: { id: value.id } });
      if (!existing) throw new NotFoundError('المنتج', value.id);
      if (existing.deletedAt !== null) {
        throw new ValidationError('لا يمكن تفعيل أو تعديل حالة عنصر محذوف');
      }
      const updated = await this.db.product.update({
        where: { id: value.id },
        data: { isActive: value.isActive },
      });
      return { id: updated.id, isActive: updated.isActive };
    }

    if (value.resource === CatalogResource.MODIFIER_GROUP) {
      const existing = await this.db.modifierGroup.findUnique({ where: { id: value.id } });
      if (!existing) throw new NotFoundError('مجموعة الإضافات', value.id);
      const updated = await this.db.modifierGroup.update({
        where: { id: value.id },
        data: { isActive: value.isActive },
      });
      return { id: updated.id, isActive: updated.isActive };
    }

    throw new ValidationError('نوع المورد غير صالح');
  }
}
