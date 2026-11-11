import { describe, it, expect, vi } from 'vitest';
import { SettleDriverCashUseCase } from '../../src/application/delivery/use-cases/settle-driver-cash.use-case';
import { ValidationError, ConflictError } from '../../src/domain/shared/errors/domain-error';

describe('SettleDriverCashUseCase Concurrency & Shift Scoping (C2)', () => {
  const branchId = '11111111-1111-4111-a111-111111111111';
  const driverId = '22222222-2222-4222-a222-222222222222';
  const cashierId = '33333333-3333-4333-a333-333333333333';
  const shiftId = '44444444-4444-4444-a444-444444444444';

  it('rejects settlement if receiver has no open cash shift in the branch', async () => {
    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: driverId }]),
          deliveryDriver: {
            findUnique: vi.fn().mockResolvedValue({
              id: driverId,
              branchId,
              fullName: 'كابتن أحمد',
              isActive: true,
            }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: cashierId, fullName: 'كاشير الفرع' }),
          },
          cashShift: {
            findFirst: vi.fn().mockResolvedValue(null), // No open shift!
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new SettleDriverCashUseCase(mockDb as any);

    await expect(
      useCase.execute({
        branchId,
        driverId,
        cashierId,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('atomically rolls back if orders count mismatches due to concurrent settlement', async () => {
    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const mockTx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: driverId }]),
          $executeRawUnsafe: vi.fn().mockResolvedValue(1),
          $queryRawUnsafe: vi.fn().mockResolvedValue([{ val: 1 }]),
          deliveryDriver: {
            findUnique: vi.fn().mockResolvedValue({
              id: driverId,
              branchId,
              fullName: 'كابتن أحمد',
              isActive: true,
            }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: cashierId, name: 'كاشير الفرع' }),
          },
          cashShift: {
            findFirst: vi.fn().mockResolvedValue({
              id: shiftId,
              branchId,
              cashierId,
              status: 'OPEN',
            }),
          },
          restaurantSetting: {
            findFirst: vi.fn().mockResolvedValue({ currency: 'EGP' }),
          },
          order: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 'order-1',
                orderNumber: '1001',
                customerName: 'عميل 1',
                totalMinor: 15000,
                paymentMethod: 'CASH',
                paymentStatus: 'PENDING',
                driverId,
                deliveredAt: new Date(),
                driverSettlementId: null,
              },
              {
                id: 'order-2',
                orderNumber: '1002',
                customerName: 'عميل 2',
                totalMinor: 20000,
                paymentMethod: 'CASH',
                paymentStatus: 'PENDING',
                driverId,
                deliveredAt: new Date(),
                driverSettlementId: null,
              },
            ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }), // Concurrency collision: only 1 was updated!
          },
          driverSettlement: {
            create: vi.fn().mockResolvedValue({
              id: 'settlement-1',
              settlementNumber: 'STL-20261106-0001',
              settledAt: new Date(),
              totalOrdersCount: 2,
              totalCollectedMinor: 35000,
              notes: null,
            }),
          },
          orderPayment: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
          },
          cashShiftMovement: {
            create: vi.fn(),
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new SettleDriverCashUseCase(mockDb as any);

    await expect(
      useCase.execute({
        branchId,
        driverId,
        cashierId,
      })
    ).rejects.toThrow(ConflictError);
  });

  it('successfully settles orders, assigns CASH_IN to receiver shift, and locks driver', async () => {
    let cashMovementCreated: any = null;
    let driverLocked = false;

    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const mockTx = {
          $queryRaw: vi.fn().mockImplementation(async (sql: any) => {
            driverLocked = true;
            return [{ id: driverId }];
          }),
          $executeRawUnsafe: vi.fn().mockResolvedValue(1),
          $queryRawUnsafe: vi.fn().mockResolvedValue([{ val: 1 }]),
          deliveryDriver: {
            findUnique: vi.fn().mockResolvedValue({
              id: driverId,
              branchId,
              fullName: 'كابتن أحمد',
              isActive: true,
            }),
            update: vi.fn().mockResolvedValue({}),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: cashierId, name: 'كاشير الفرع' }),
          },
          cashShift: {
            findFirst: vi.fn().mockResolvedValue({
              id: shiftId,
              branchId,
              cashierId,
              status: 'OPEN',
            }),
          },
          restaurantSetting: {
            findFirst: vi.fn().mockResolvedValue({ currency: 'EGP' }),
          },
          order: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 'order-1',
                orderNumber: '1001',
                customerName: 'عميل 1',
                totalMinor: 15000,
                paymentMethod: 'CASH',
                paymentStatus: 'PENDING',
                driverId,
                deliveredAt: new Date(),
                driverSettlementId: null,
              },
            ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            count: vi.fn().mockResolvedValue(0),
          },
          driverSettlement: {
            create: vi.fn().mockResolvedValue({
              id: 'settlement-1',
              settlementNumber: 'STL-20261106-0001',
              settledAt: new Date(),
              totalOrdersCount: 1,
              totalCollectedMinor: 15000,
              notes: 'تسوية منتظمة',
            }),
          },
          orderPayment: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
          },
          cashShiftMovement: {
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              cashMovementCreated = data;
              return { id: 'movement-1', ...data };
            }),
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new SettleDriverCashUseCase(mockDb as any);
    const result = await useCase.execute({
      branchId,
      driverId,
      cashierId,
      notes: 'تسوية منتظمة',
    });

    expect(driverLocked).toBe(true);
    expect(result.settlement.settlementNumber).toBe('STL-20261106-0001');
    expect(cashMovementCreated).not.toBeNull();
    expect(cashMovementCreated.cashShiftId).toBe(shiftId);
    expect(cashMovementCreated.type).toBe('CASH_IN');
    expect(cashMovementCreated.amountMinor).toBe(15000);
    expect(cashMovementCreated.performedById).toBe(cashierId);
  });
});
