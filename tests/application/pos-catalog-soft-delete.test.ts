import { describe, expect, it, vi } from 'vitest';
import { PrismaPosTransaction } from '../../src/infrastructure/pos/prisma-pos-transaction';
import { SetCatalogStatusUseCase } from '../../src/application/catalog/use-cases/set-catalog-status.use-case';
import { CatalogResource } from '../../src/domain/catalog/enums/catalog-resource.enum';
import { ValidationError, NotFoundError } from '../../src/domain/shared/errors/domain-error';
import { PrismaClient } from '@prisma/client';

describe('C8: POS Catalog Soft-Delete Integrity', () => {
  describe('PrismaPosTransaction.getProducts', () => {
    it('queries products with deletedAt: null for both product and its category', async () => {
      const mockClient = {
        product: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'prod-1',
              nameAr: 'شاي',
              nameEn: 'Tea',
              categoryId: 'cat-1',
              sizes: [{ id: 'size-1', nameAr: 'عادي', nameEn: 'Regular', price: 2000 }],
              modifierGroups: [],
            },
          ]),
        },
      };

      const posTx = new PrismaPosTransaction(mockClient as never);
      const result = await posTx.getProducts('branch-1', ['prod-1']);

      expect(mockClient.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['prod-1'] },
            isActive: true,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
          }),
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod-1');
    });
  });

  describe('SetCatalogStatusUseCase Soft-Delete Protection', () => {
    it('rejects activating or modifying status of a deleted product', async () => {
      const mockDb = {
        product: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'prod-del-1',
            isActive: false,
            deletedAt: new Date(),
          }),
          update: vi.fn(),
        },
      } as unknown as PrismaClient;

      const useCase = new SetCatalogStatusUseCase(mockDb);

      await expect(
        useCase.execute({
          resource: CatalogResource.PRODUCT,
          id: 'prod-del-1',
          isActive: true,
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        useCase.execute({
          resource: CatalogResource.PRODUCT,
          id: 'prod-del-1',
          isActive: true,
        })
      ).rejects.toThrow('لا يمكن تفعيل أو تعديل حالة عنصر محذوف');

      expect(mockDb.product.update).not.toHaveBeenCalled();
    });

    it('rejects activating or modifying status of a deleted category', async () => {
      const mockDb = {
        category: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cat-del-1',
            isActive: false,
            deletedAt: new Date(),
          }),
          update: vi.fn(),
        },
      } as unknown as PrismaClient;

      const useCase = new SetCatalogStatusUseCase(mockDb);

      await expect(
        useCase.execute({
          resource: CatalogResource.CATEGORY,
          id: 'cat-del-1',
          isActive: true,
        })
      ).rejects.toThrow(ValidationError);

      expect(mockDb.category.update).not.toHaveBeenCalled();
    });

    it('allows updating status of an existing non-deleted item', async () => {
      const mockDb = {
        product: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'prod-live-1',
            isActive: false,
            deletedAt: null,
          }),
          update: vi.fn().mockResolvedValue({
            id: 'prod-live-1',
            isActive: true,
            deletedAt: null,
          }),
        },
      } as unknown as PrismaClient;

      const useCase = new SetCatalogStatusUseCase(mockDb);
      const res = await useCase.execute({
        resource: CatalogResource.PRODUCT,
        id: 'prod-live-1',
        isActive: true,
      });

      expect(mockDb.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-live-1' },
        data: { isActive: true },
      });
      expect(res.isActive).toBe(true);
    });

    it('throws NotFoundError if item does not exist', async () => {
      const mockDb = {
        product: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaClient;

      const useCase = new SetCatalogStatusUseCase(mockDb);

      await expect(
        useCase.execute({
          resource: CatalogResource.PRODUCT,
          id: 'non-existing',
          isActive: true,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
