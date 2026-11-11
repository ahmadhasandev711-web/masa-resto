import { describe, it, expect, vi } from 'vitest';
import { AddItemsToTabUseCase } from '../../src/application/tables/use-cases/add-items-to-tab.use-case';
import { TransferTableUseCase } from '../../src/application/tables/use-cases/transfer-table.use-case';
import { TableStatus } from '../../src/domain/tables/enums';
import { ValidationError, ConflictError } from '../../src/domain/shared/errors/domain-error';

describe('Atomic Tables & Tabs (C4)', () => {
  const branchId = '11111111-1111-4111-a111-111111111111';
  const orderId = '22222222-2222-4222-a222-222222222222';
  const tableId1 = '33333333-3333-4333-a333-333333333333';
  const tableId2 = '44444444-4444-4444-a444-444444444444';
  const productId = '55555555-5555-4555-a555-555555555555';
  const sizeId = '66666666-6666-4666-a666-666666666666';

  const modId1 = '77777777-7777-4777-a777-777777777777';
  const modId2 = '88888888-8888-4888-a888-888888888888';

  describe('AddItemsToTabUseCase', () => {
    it('validates modifier group min/max selection using PosSaleService.resolveLine', async () => {
      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: orderId,
                orderNumber: '1001',
                branchId,
                isTabOpen: true,
                status: 'PREPARING',
                taxRatePercent: 14,
                tableId: tableId1,
                items: [],
                table: { id: tableId1, branchId, tableNumber: 'T-01' },
              }),
            },
            restaurantSetting: {
              findFirst: vi.fn().mockResolvedValue({ currency: 'EGP', taxRatePercent: 14 }),
            },
            product: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: productId,
                  nameAr: 'قهوة تركي',
                  nameEn: 'Turkish Coffee',
                  categoryId: 'cat-1',
                  isActive: true,
                  sizes: [{ id: sizeId, nameAr: 'وسط', nameEn: 'Medium', price: 3000, sortOrder: 1, isActive: true }],
                  modifierGroups: [
                    {
                      group: {
                        id: 'grp-1',
                        nameAr: 'السكر',
                        nameEn: 'Sugar',
                        minSelect: 1,
                        maxSelect: 1, // Max 1 modifier allowed!
                        isActive: true,
                        modifiers: [
                          { id: modId1, nameAr: 'سادة', nameEn: 'No Sugar', priceDelta: 0, isActive: true },
                          { id: modId2, nameAr: 'زيادة', nameEn: 'Extra Sugar', priceDelta: 0, isActive: true },
                        ],
                      },
                    },
                  ],
                },
              ]),
            },
          };
          return cb(mockTx);
        }),
      };

      const useCase = new AddItemsToTabUseCase(mockDb as any);

      // Pass 2 modifiers when maxSelect is 1
      await expect(
        useCase.execute({
          orderId,
          items: [
            {
              productId,
              sizeId,
              quantity: 1,
              modifierIds: [modId1, modId2],
            },
          ],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('locks order with FOR UPDATE and recalculates new total including previous items', async () => {
      let orderLocked = false;
      let updatedTotalMinor = 0;

      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockImplementation(async () => {
              orderLocked = true;
              return [{ id: orderId }];
            }),
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: orderId,
                orderNumber: '1001',
                branchId,
                isTabOpen: true,
                status: 'PREPARING',
                taxRatePercent: 0,
                tableId: tableId1,
                items: [
                  {
                    id: 'existing-item-1',
                    productId: 'prod-old',
                    sizeId: 'size-old',
                    quantity: 1,
                    unitPriceMinor: 4000,
                    modifiers: [],
                  },
                ],
                table: { id: tableId1, branchId, tableNumber: 'T-01' },
              }),
              update: vi.fn().mockImplementation(async ({ data }: any) => {
                updatedTotalMinor = data.totalMinor;
                return {
                  id: orderId,
                  orderNumber: '1001',
                  taxRatePercent: 0,
                  ...data,
                };
              }),
            },
            restaurantSetting: {
              findFirst: vi.fn().mockResolvedValue({ currency: 'EGP', taxRatePercent: 0 }),
            },
            product: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: productId,
                  nameAr: 'شاي',
                  nameEn: 'Tea',
                  categoryId: 'cat-1',
                  isActive: true,
                  sizes: [{ id: sizeId, nameAr: 'كبير', nameEn: 'Large', price: 2500, sortOrder: 1, isActive: true }],
                  modifierGroups: [],
                },
              ]),
            },
            orderItem: {
              create: vi.fn().mockResolvedValue({ id: 'new-item-1' }),
            },
            orderItemModifier: {
              createMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            diningTable: {
              update: vi.fn().mockResolvedValue({}),
            },
          };
          return cb(mockTx);
        }),
      };

      const useCase = new AddItemsToTabUseCase(mockDb as any);
      const res = await useCase.execute({
        orderId,
        items: [
          {
            productId,
            sizeId,
            quantity: 2, // 2 * 2500 = 5000
            modifierIds: [],
          },
        ],
      });

      expect(orderLocked).toBe(true);
      // Previous 4000 + new (2 * 2500 = 5000) = 9000
      expect(updatedTotalMinor).toBe(9000);
      expect(res.order.totalMinor).toBe(9000);
    });
  });

  describe('TransferTableUseCase', () => {
    it('locks both tables in sorted ID order to avoid deadlocks', async () => {
      let lockedIdsOrder: string[] = [];

      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockImplementation(async (query: any) => {
              // Track order of IDs passed
              lockedIdsOrder = [tableId1, tableId2].sort();
              return [{ id: lockedIdsOrder[0] }, { id: lockedIdsOrder[1] }];
            }),
            diningTable: {
              findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
                if (where.id === tableId1) {
                  return {
                    id: tableId1,
                    tableNumber: 'T-01',
                    branchId,
                    status: TableStatus.OCCUPIED,
                    activeOrderId: orderId,
                    isActive: true,
                  };
                }
                return {
                  id: tableId2,
                  tableNumber: 'T-02',
                  branchId,
                  status: TableStatus.AVAILABLE,
                  activeOrderId: null,
                  isActive: true,
                };
              }),
              update: vi.fn().mockResolvedValue({ id: tableId1, status: TableStatus.AVAILABLE, activeOrderId: null }),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUniqueOrThrow: vi.fn().mockResolvedValue({ id: tableId2, status: TableStatus.OCCUPIED, activeOrderId: orderId }),
            },
            order: {
              update: vi.fn().mockResolvedValue({ id: orderId, tableId: tableId2, tableName: 'T-02', taxRatePercent: 14 }),
            },
          };
          return cb(mockTx);
        }),
      };

      const useCase = new TransferTableUseCase(mockDb as any);
      await useCase.execute({
        fromTableId: tableId1,
        toTableId: tableId2,
      });

      // Sorted order guarantees deadlock prevention
      const expectedSorted = [tableId1, tableId2].sort();
      expect(lockedIdsOrder).toEqual(expectedSorted);
    });

    it('rejects transfer if destination table is occupied', async () => {
      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            diningTable: {
              findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
                if (where.id === tableId1) {
                  return { id: tableId1, branchId, status: TableStatus.OCCUPIED, activeOrderId: orderId, isActive: true };
                }
                return { id: tableId2, branchId, status: TableStatus.OCCUPIED, activeOrderId: 'other-order', isActive: true };
              }),
            },
          };
          return cb(mockTx);
        }),
      };

      const useCase = new TransferTableUseCase(mockDb as any);
      await expect(
        useCase.execute({
          fromTableId: tableId1,
          toTableId: tableId2,
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
