import { describe, it, expect, vi } from 'vitest';
import { DocumentSequenceService } from '../../src/domain/ordering/services/document-sequence.service';
import { OrderNumberService } from '../../src/domain/ordering/services/order-number.service';

describe('DocumentSequenceService & OrderNumberService (C1)', () => {
  it('throws when database query fails instead of falling back to count', async () => {
    const mockTx = {
      $executeRawUnsafe: vi.fn().mockRejectedValue(new Error('Deadlock detected')),
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('Deadlock detected')),
    };

    await expect(
      DocumentSequenceService.getNextSequence(mockTx as never, 'ORDER', 1000)
    ).rejects.toThrow('Deadlock detected');

    await expect(
      OrderNumberService.getNextOrderNumber(mockTx as never)
    ).rejects.toThrow();
  });

  it('generates sequential numbers atomically without race conditions across 20 concurrent requests', async () => {
    let currentValue = 1000;
    // Simulate atomic row lock in database
    const mockTx = {
      $executeRawUnsafe: vi.fn().mockImplementation(async () => 1),
      $queryRawUnsafe: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('LAST_INSERT_ID')) {
          currentValue += 1;
          return [{ val: currentValue }];
        }
        return [{ val: currentValue }];
      }),
    };

    // Execute 20 concurrent requests
    const promises = Array.from({ length: 20 }, () =>
      DocumentSequenceService.getNextSequence(mockTx as never, 'ORDER', 1000)
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(20);
    // All numbers must be unique
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(20);
    // Verify strictly ascending consecutive sequence from 1001 to 1020
    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1001);
    expect(sorted[19]).toBe(1020);
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i]).toBe(1001 + i);
    }
  });

  it('generates daily web order number matching Africa/Cairo local date at 1:00 AM local time', async () => {
    // 23:30 UTC on Nov 5 is 01:30 AM Cairo time (+02:00) on Nov 6
    const lateUtcDate = new Date('2026-11-05T23:30:00.000Z');

    const mockTx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ val: 1 }]),
    };

    const webOrderNumber = await DocumentSequenceService.getNextWebOrderNumber(
      mockTx as never,
      lateUtcDate
    );

    // Cairo date must be 20261106, padded to 3 digits sequence: WEB-20261106-001
    expect(webOrderNumber).toBe('WEB-20261106-001');
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_sequences'),
      'WEB-20261106',
      0
    );
  });

  it('formats PO, STL, and RET document numbers with correct sequence keys', async () => {
    const mockTx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockImplementation(async () => {
        return [{ val: 1042 }];
      }),
    };

    const poNumber = await DocumentSequenceService.getNextPurchaseOrderNumber(mockTx as never);
    expect(poNumber).toBe('PO-1042');
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_sequences'),
      'PO',
      1000
    );

    const cairoDate = new Date('2026-11-06T12:00:00.000Z');
    const stlNumber = await DocumentSequenceService.getNextSettlementNumber(mockTx as never, cairoDate);
    expect(stlNumber).toBe('STL-20261106-1042');
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_sequences'),
      'STL-20261106',
      0
    );

    const retNumber = await DocumentSequenceService.getNextReturnNumber(mockTx as never);
    expect(retNumber).toBe('RET-1042');
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_sequences'),
      'RET',
      1000
    );
  });
});
