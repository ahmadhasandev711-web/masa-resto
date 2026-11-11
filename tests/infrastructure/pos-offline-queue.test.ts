import { describe, it, expect, beforeEach } from 'vitest';
import { PosOfflineQueue } from '../../src/infrastructure/pos/pos-offline-queue';
import { CreatePosOrderDto } from '../../src/application/pos/dto/pos.dto';
import { PosPaymentMode } from '../../src/domain/pos/enums';

describe('PosOfflineQueue', () => {
  const sampleRequest: CreatePosOrderDto = {
    branchId: '00000000-0000-0000-0000-000000000001',
    cashierId: '00000000-0000-0000-0000-000000000002',
    shiftId: '00000000-0000-0000-0000-000000000003',
    idempotencyKey: '00000000-0000-0000-0000-000000000004',
    type: 'TAKEAWAY',
    payment: {
      mode: PosPaymentMode.CASH,
      tenderedCashMinor: 5000,
      paidMinor: 5000,
    },
    items: [
      {
        productId: '00000000-0000-0000-0000-000000000010',
        sizeId: '00000000-0000-0000-0000-000000000020',
        quantity: 2,
        modifierIds: [],
      },
    ],
  };

  const catalogMock = [
    {
      id: '00000000-0000-0000-0000-000000000010',
      nameAr: 'شاي كرك',
      nameEn: 'Karak Tea',
      sizes: [
        {
          id: '00000000-0000-0000-0000-000000000020',
          nameAr: 'كبير',
          nameEn: 'Large',
          priceMinor: 2500,
        },
      ],
      modifierGroups: [],
    },
  ];

  const settingsMock = {
    id: 's-1',
    nameAr: 'المطعم',
    nameEn: 'Restaurant',
    currency: 'EGP',
    currencySymbol: 'ج.م',
    locale: 'ar-EG',
    taxRatePercent: '14',
    deliveryFeeMinor: 0,
    phone: null,
    address: null,
  };

  beforeEach(() => {
    PosOfflineQueue.clearQueue();
  });

  it('generates offline receipts with valid structure', () => {
    const receipt = PosOfflineQueue.createOfflineReceipt({
      request: sampleRequest,
      branchName: 'الفرع الرئيسي',
      branchCode: 'MAIN',
      cashierName: 'كاشير 1',
      totals: { subtotalMinor: 4386, taxMinor: 614, discountMinor: 0, totalMinor: 5000 },
      lines: [
        {
          productId: '00000000-0000-0000-0000-000000000010',
          sizeId: '00000000-0000-0000-0000-000000000020',
          productNameAr: 'شاي كرك',
          productNameEn: 'Karak Tea',
          sizeNameAr: 'كبير',
          sizeNameEn: 'Large',
          unitPriceMinor: 2500,
          quantity: 2,
          totalPriceMinor: 5000,
          modifiers: [],
        },
      ],
      currency: 'EGP',
      locale: 'ar-EG',
    });

    expect(receipt.orderNumber).toMatch(/^OFF-[A-Z0-9]+-[A-Z0-9]+-\d+/);
    expect(receipt.totalMinor).toBe(5000);
    expect(receipt.idempotencyKey).toBe(sampleRequest.idempotencyKey);
    expect(receipt.branchName).toBe('الفرع الرئيسي');
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0].productNameAr).toBe('شاي كرك');
  });

  it('enqueues, updates status, and removes offline sales correctly', () => {
    const receipt = PosOfflineQueue.createOfflineReceipt({
      request: sampleRequest,
      branchName: 'الفرع الرئيسي',
      branchCode: 'MAIN',
      cashierName: 'كاشير 1',
      totals: { subtotalMinor: 4386, taxMinor: 614, discountMinor: 0, totalMinor: 5000 },
      lines: [],
      currency: 'EGP',
      locale: 'ar-EG',
    });

    const queued = PosOfflineQueue.enqueueOfflineSale(sampleRequest, receipt);
    expect(queued.id).toBeDefined();
    expect(queued.syncStatus).toBe('PENDING');

    const queue = PosOfflineQueue.getPendingQueue();
    expect(queue).toHaveLength(1);

    PosOfflineQueue.updateSyncStatus(queued.id, 'SYNCING');
    const updated = PosOfflineQueue.getPendingQueue().find((q) => q.id === queued.id);
    expect(updated?.syncStatus).toBe('SYNCING');

    PosOfflineQueue.removeOfflineSale(queued.id);
    expect(PosOfflineQueue.getPendingQueue()).toHaveLength(0);
  });

  it('caches and retrieves catalog and settings', () => {
    PosOfflineQueue.cacheCatalog(catalogMock as any);
    PosOfflineQueue.cacheSettings(settingsMock);

    expect(PosOfflineQueue.getCachedCatalog()).toEqual(catalogMock);
    expect(PosOfflineQueue.getCachedSettings()).toEqual(settingsMock);
  });
});
