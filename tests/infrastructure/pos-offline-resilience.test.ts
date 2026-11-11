import { describe, it, expect, vi } from 'vitest';
import { PosOfflineQueue } from '../../src/infrastructure/pos/pos-offline-queue';
import { PrismaPosRepository } from '../../src/infrastructure/pos/prisma-pos.repository';
import { ValidationError } from '../../src/domain/shared/errors/domain-error';

describe('Offline POS Resilience (C5)', () => {
  const branchId = '11111111-1111-4111-a111-111111111111';
  const cashierId = '22222222-2222-4222-a222-222222222222';
  const shiftId = '33333333-3333-4333-a333-333333333333';

  it('rejects closing shift on server if clientPendingCount > 0', async () => {
    const repository = new PrismaPosRepository();

    await expect(
      repository.closeShift(branchId, cashierId, shiftId, 10000, 3) // 3 pending sales
    ).rejects.toThrow(ValidationError);
  });

  it('generates offline order number with format OFF-{branchCode}-{deviceShortId}-{localSeq}', () => {
    const receipt = PosOfflineQueue.createOfflineReceipt({
      request: {
        idempotencyKey: 'offline-sale-key-1',
        branchId,
        cashShiftId: shiftId,
        type: 'TAKEAWAY' as any,
        discountMinor: 0,
        items: [],
        payments: [],
      },
      branchName: 'فرع المعادي',
      branchCode: 'MAADI',
      cashierId,
      currency: 'EGP',
      locale: 'ar-EG',
      totals: { subtotalMinor: 5000, taxMinor: 0, discountMinor: 0, totalMinor: 5000 },
      lines: [],
    });

    // Check order number pattern: OFF-MAADI-XXXX-XXXX
    expect(receipt.orderNumber).toMatch(/^OFF-MAADI-[A-Z0-9]+-[0-9]{3,}$/);
    expect(receipt.idempotencyKey).toBe('offline-sale-key-1');
  });

  it('updates queued sale status to FAILED on server error without silencing errors', () => {
    PosOfflineQueue.clear();

    const queued = PosOfflineQueue.enqueueSale(
      {
        idempotencyKey: 'sale-1',
        branchId,
        cashShiftId: shiftId,
        type: 'TAKEAWAY' as any,
        discountMinor: 0,
        items: [],
        payments: [],
      },
      {
        id: 'rec-1',
        orderNumber: 'OFF-BR-01-001',
        branchId,
        branchName: 'الفرع',
        cashierId,
        cashShiftId: shiftId,
        idempotencyKey: 'sale-1',
        type: 'TAKEAWAY' as any,
        customerName: null,
        customerNotes: null,
        createdAt: new Date().toISOString(),
        currency: 'EGP',
        locale: 'ar-EG',
        items: [],
        payments: [],
        subtotalMinor: 1000,
        taxMinor: 0,
        discountMinor: 0,
        totalMinor: 1000,
      }
    );

    expect(queued.syncStatus).toBe('PENDING');

    PosOfflineQueue.updateSaleStatus(queued.id, 'FAILED', 'تغير سعر الصنف في الكتالوج');

    const sales = PosOfflineQueue.getQueuedSales();
    const updated = sales.find((s) => s.id === queued.id);
    expect(updated?.syncStatus).toBe('FAILED');
    expect(updated?.errorMessage).toBe('تغير سعر الصنف في الكتالوج');
  });
});
