import { describe, it, expect, vi } from 'vitest';
import { CreatePosOrderUseCase } from '../../src/application/pos/use-cases/create-pos-order.use-case';
import { PosRepository, PosTransaction } from '../../src/domain/pos/contracts/pos.repository';
import { OrderType, PaymentMethod } from '../../src/domain/ordering/enums';

describe('H4: P2002 Idempotency Replay Recovery in CreatePosOrderUseCase', () => {
  it('recovers from concurrent P2002 unique constraint error by returning the existing replay receipt', async () => {
    const branchId = crypto.randomUUID();
    const cashierId = crypto.randomUUID();
    const cashShiftId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const sizeId = crypto.randomUUID();

    const mockReceipt = {
      orderId: crypto.randomUUID(),
      orderNumber: 'POS-001',
      orderType: OrderType.TAKEAWAY,
      type: OrderType.TAKEAWAY,
      branchId,
      cashierId,
      cashShiftId,
      idempotencyKey,
      items: [
        {
          productId,
          productNameAr: 'شاي',
          productNameEn: 'Tea',
          sizeId,
          sizeNameAr: 'عادي',
          sizeNameEn: 'Regular',
          unitPriceMinor: 2000,
          quantity: 1,
          lineTotalMinor: 2000,
          modifiers: [],
        },
      ],
      lines: [
        {
          productId,
          productNameAr: 'شاي',
          productNameEn: 'Tea',
          sizeId,
          sizeNameAr: 'عادي',
          sizeNameEn: 'Regular',
          unitPriceMinor: 2000,
          quantity: 1,
          lineTotalMinor: 2000,
          modifiers: [],
        },
      ],
      subtotalMinor: 2000,
      discountMinor: 0,
      taxMinor: 280,
      totalMinor: 2280,
      payments: [{ method: PaymentMethod.CASH, amountMinor: 2280 }],
      currency: 'EGP',
      currencySymbol: 'ج.م',
      createdAt: new Date(),
    };

    let replayCalls = 0;
    const mockTransaction: PosTransaction = {
      lockShift: vi.fn().mockResolvedValue(undefined),
      findReplay: vi.fn().mockImplementation(async () => {
        replayCalls++;
        return replayCalls > 2 ? (mockReceipt as unknown as import('../../src/domain/pos/entities/pos-receipt').PosReceipt) : null;
      }),
      getSettings: vi.fn().mockResolvedValue({
        nameAr: 'مطعم',
        nameEn: 'Restaurant',
        currency: 'EGP',
        locale: 'ar-EG',
        taxRatePercent: '14.00',
      }),
      getProducts: vi.fn().mockResolvedValue([
        {
          id: productId,
          nameAr: 'شاي',
          nameEn: 'Tea',
          sizes: [{ id: sizeId, nameAr: 'عادي', nameEn: 'Regular', price: 2000, isActive: true }],
          modifierGroups: [],
        },
      ]),
      saveSale: vi.fn().mockRejectedValue({
        code: 'P2002',
        meta: { target: ['pos_idempotency_key'] },
        message: 'Unique constraint failed on pos_idempotency_key',
      }),
    };

    const mockRepo: PosRepository = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTransaction)),
    } as unknown as PosRepository;

    const useCase = new CreatePosOrderUseCase(mockRepo);
    const scope = { branchId, cashierId, canDiscount: false };

    const result = await useCase.execute(
      {
        branchId,
        cashShiftId,
        idempotencyKey,
        type: OrderType.TAKEAWAY,
        discountMinor: 0,
        items: [{ productId, sizeId, modifierIds: [], quantity: 1 }],
        payments: [{ method: PaymentMethod.CASH, amountMinor: 2280 }],
      },
      scope
    );

    expect(result).toBeDefined();
    expect(result.orderNumber).toBe('POS-001');
    expect(result.idempotencyKey).toBe(idempotencyKey);
    expect(mockTransaction.saveSale).toHaveBeenCalled();
  });
});
