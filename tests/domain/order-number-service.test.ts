import { describe, it, expect, vi } from 'vitest';
import { OrderNumberService } from '../../src/domain/ordering/services/order-number.service';

type TxParam = Parameters<typeof OrderNumberService.getNextOrderNumber>[0];

describe('OrderNumberService', () => {
  it('generates next order number via document sequence query', async () => {
    const mockTx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ val: 1042 }]),
    };

    const orderNumber = await OrderNumberService.getNextOrderNumber(mockTx as unknown as TxParam);
    expect(orderNumber).toBe('1042');
  });

  it('throws an error when transaction fails without unsafe fallback', async () => {
    const mockTx = {
      $executeRawUnsafe: vi.fn().mockRejectedValue(new Error('Transaction aborted')),
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('Transaction aborted')),
    };

    await expect(
      OrderNumberService.getNextOrderNumber(mockTx as unknown as TxParam)
    ).rejects.toThrow('Transaction aborted');
  });
});
