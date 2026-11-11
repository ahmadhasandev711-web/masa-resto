import { describe, it, expect, vi } from 'vitest';
import { BumpKitchenOrderUseCase } from '../../src/application/kitchen/use-cases/bump-kitchen-order.use-case';
import { GetKitchenOrdersUseCase } from '../../src/application/kitchen/use-cases/get-kitchen-orders.use-case';
import { OrderStatus, OrderType, PaymentStatus } from '../../src/domain/ordering/enums';

describe('C3: Kitchen Bump & Dine-in Tab Decoupling Lifecycle', () => {
  it('does NOT mark dine-in tab as COMPLETED or PAID when bumped in kitchen', async () => {
    const orderId = crypto.randomUUID();
    const branchId = crypto.randomUUID();

    const tabOrder = {
      id: orderId,
      branchId,
      type: OrderType.DINE_IN,
      isTabOpen: true,
      status: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.UNPAID,
      items: [{ id: crypto.randomUUID(), orderId, isPrepared: false }],
    };

    const mockTx = {
      orderItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        update: vi.fn().mockImplementation(({ data }) => ({
          ...tabOrder,
          ...data,
          items: [{ id: 'item-1', isPrepared: true }],
        })),
      },
    };

    const mockPrisma = {
      order: {
        findUnique: vi.fn().mockResolvedValue(tabOrder),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    };

    const bumpUseCase = new BumpKitchenOrderUseCase(mockPrisma as unknown as import('@prisma/client').PrismaClient);
    const result = await bumpUseCase.execute({ orderId, branchId });

    // 1. Items must be marked prepared
    expect(mockTx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId, isPrepared: false },
      data: expect.objectContaining({ isPrepared: true }),
    });

    // 2. CRITICAL: Order status MUST NOT be transitioned to COMPLETED
    expect(result.status).toBe(OrderStatus.PREPARING);
    // 3. CRITICAL: Payment status MUST NOT be marked PAID
    expect(result.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(result.isTabOpen).toBe(true);
  });

  it('does NOT mark takeaway orders as PAID when bumped in kitchen (payment belongs to cashier)', async () => {
    const orderId = crypto.randomUUID();
    const branchId = crypto.randomUUID();

    const takeawayOrder = {
      id: orderId,
      branchId,
      type: OrderType.TAKEAWAY,
      isTabOpen: false,
      status: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.UNPAID,
      items: [{ id: crypto.randomUUID(), orderId, isPrepared: false }],
    };

    const mockTx = {
      orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      order: {
        update: vi.fn().mockImplementation(({ data }) => ({
          ...takeawayOrder,
          ...data,
          items: [{ id: 'item-2', isPrepared: true }],
        })),
      },
    };

    const mockPrisma = {
      order: { findUnique: vi.fn().mockResolvedValue(takeawayOrder) },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    };

    const bumpUseCase = new BumpKitchenOrderUseCase(mockPrisma as any);
    const result = await bumpUseCase.execute({ orderId, branchId });

    expect(result.status).toBe(OrderStatus.COMPLETED);
    // MUST remain UNPAID so cashier can collect money
    expect(result.paymentStatus).toBe(PaymentStatus.UNPAID);
  });

  it('displays tab orders in KDS query when they have unprepared items, even if kitchenCompletedAt was set previously', async () => {
    const branchId = crypto.randomUUID();
    const tabOrderId = crypto.randomUUID();

    const mockPrisma = {
      order: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          // Verify that query includes open tabs with unprepared items
          expect(where.OR).toEqual([
            { status: OrderStatus.PREPARING },
            { isTabOpen: true, items: { some: { isPrepared: false } } },
          ]);

          return [
            {
              id: tabOrderId,
              orderNumber: 'TAB-101',
              type: OrderType.DINE_IN,
              status: OrderStatus.PREPARING,
              isTabOpen: true,
              paymentStatus: PaymentStatus.UNPAID,
              customerName: 'طاولة 3',
              customerPhone: null,
              customerNotes: null,
              kitchenNotes: null,
              createdAt: new Date(),
              kitchenStartedAt: new Date(),
              branch: { id: branchId, nameAr: 'الفرع الرئيسي', nameEn: 'Main', code: 'MAIN' },
              table: { id: 'table-1', tableNumber: '3', section: { nameAr: 'الصالة', nameEn: 'Hall' } },
              items: [
                {
                  id: 'item-new-dish',
                  productId: 'p-1',
                  sizeId: 's-1',
                  productNameAr: 'شيش طاووق دور ثان',
                  productNameEn: 'Shish Tawook Round 2',
                  sizeNameAr: 'كبير',
                  sizeNameEn: 'Large',
                  quantity: 1,
                  unitPriceMinor: 8000,
                  totalPriceMinor: 8000,
                  isPrepared: false,
                  preparedAt: null,
                  notes: null,
                  modifiers: [],
                },
              ],
            },
          ];
        }),
      },
    };

    const getKitchenUseCase = new GetKitchenOrdersUseCase(mockPrisma as unknown as import('@prisma/client').PrismaClient);
    const cards = await getKitchenUseCase.execute({ branchId });

    expect(cards).toHaveLength(1);
    expect(cards[0].orderNumber).toBe('TAB-101');
    expect(cards[0].items[0].productNameAr).toBe('شيش طاووق دور ثان');
    expect(cards[0].items[0].isPrepared).toBe(false);
  });
});
