import { describe, it, expect, vi } from 'vitest';
import { SaveProductUseCase } from '../../src/application/catalog/use-cases/save-product.use-case';

describe('C2: Product Sizes Stability & Recipe Protection in SaveProductUseCase', () => {
  it('preserves existing sizeId and updates in-place when product is edited', async () => {
    const productId = 'prod-100';
    const existingSizeId = 'size-existing-1';

    const mockTx = {
      productSize: {
        findMany: vi.fn().mockResolvedValue([
          { id: existingSizeId, productId, nameAr: 'وسط', nameEn: 'Medium', price: 5000, isActive: true },
        ]),
        update: vi.fn().mockResolvedValue({ id: existingSizeId }),
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      product: {
        update: vi.fn().mockResolvedValue({ id: productId }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: productId,
          nameAr: 'شاي معدل',
          sizes: [{ id: existingSizeId, nameAr: 'وسط معدل', price: 6000 }],
        }),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    };

    const useCase = new SaveProductUseCase(mockPrisma as unknown as import('@prisma/client').PrismaClient);

    const result = await useCase.execute({
      id: productId,
      categoryId: 'cat-1',
      nameAr: 'شاي معدل',
      nameEn: 'Modified Tea',
      sizes: [
        { id: existingSizeId, nameAr: 'وسط معدل', nameEn: 'Medium Modified', price: '60.00' },
      ],
      modifierGroupIds: [],
    });

    // 1. MUST NOT delete existing sizes
    expect(mockTx.productSize.deleteMany).not.toHaveBeenCalled();

    // 2. MUST update the existing size by its ID
    expect(mockTx.productSize.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existingSizeId },
        data: expect.objectContaining({
          nameAr: 'وسط معدل',
          price: 6000,
          isActive: true,
        }),
      })
    );

    expect(result.sizes[0].id).toBe(existingSizeId);
  });

  it('marks removed size as isActive=false instead of deleting when removed from form', async () => {
    const productId = 'prod-200';
    const sizeToKeepId = 'size-keep-1';
    const sizeToRemoveId = 'size-remove-2';

    const mockTx = {
      productSize: {
        findMany: vi.fn().mockResolvedValue([
          { id: sizeToKeepId, productId, nameAr: 'صغير', nameEn: 'Small', price: 3000, isActive: true },
          { id: sizeToRemoveId, productId, nameAr: 'كبير', nameEn: 'Large', price: 7000, isActive: true },
        ]),
        update: vi.fn().mockResolvedValue({ id: sizeToKeepId }),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      product: {
        update: vi.fn().mockResolvedValue({ id: productId }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: productId,
          sizes: [{ id: sizeToKeepId, isActive: true }, { id: sizeToRemoveId, isActive: false }],
        }),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    };

    const useCase = new SaveProductUseCase(mockPrisma as any);

    await useCase.execute({
      id: productId,
      categoryId: 'cat-1',
      nameAr: 'قهوة',
      nameEn: 'Coffee',
      sizes: [
        { id: sizeToKeepId, nameAr: 'صغير', nameEn: 'Small', price: '30.00' },
      ],
      modifierGroupIds: [],
    });

    // 1. MUST NOT call deleteMany on sizes
    expect(mockTx.productSize.deleteMany).not.toHaveBeenCalled();

    // 2. MUST deactivate the removed size
    expect(mockTx.productSize.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [sizeToRemoveId] } },
      data: { isActive: false },
    });
  });
});
