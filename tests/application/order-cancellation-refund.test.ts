import { describe, it, expect, vi } from 'vitest';
import { UpdateOrderStatusUseCase } from '../../src/application/ordering/use-cases/update-order-status.use-case';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../../src/domain/ordering/enums';
import { PermissionCode } from '../../src/domain/staff/enums/permission.enum';
import { ForbiddenError, ValidationError, ConflictError } from '../../src/domain/shared/errors/domain-error';
import { CashShiftCalculatorService } from '../../src/domain/finance/services/cash-shift-calculator.service';
import { Money } from '../../src/domain/shared/value-objects/money';

describe('Order Cancellation & Void/Refunds (C3)', () => {
  const orderId = '11111111-1111-4111-a111-111111111111';
  const branchId = '22222222-2222-4222-a222-222222222222';
  const userId = '33333333-3333-4333-a333-333333333333';
  const shiftId = '44444444-4444-4444-a444-444444444444';

  it('rejects voiding a PAID order without VOID_PAID_ORDER permission', async () => {
    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const mockTx = {
          order: {
            findUnique: vi.fn().mockResolvedValue({
              id: orderId,
              orderNumber: '1001',
              type: 'DINE_IN',
              status: OrderStatus.PREPARING,
              branchId,
              paymentMethod: PaymentMethod.CASH,
              paymentStatus: PaymentStatus.PAID,
              totalMinor: 15000,
              customerId: null,
            }),
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new UpdateOrderStatusUseCase(mockDb as any);

    await expect(
      useCase.execute({
        orderId,
        nextStatus: OrderStatus.CANCELLED,
        cancelReason: 'العميل غادر المكان',
        userId,
        userPermissions: [PermissionCode.POS_ACCESS, PermissionCode.MANAGE_ORDERS], // Missing VOID_PAID_ORDER
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects voiding a PAID order if cancel reason is missing or shorter than 5 characters', async () => {
    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const mockTx = {
          order: {
            findUnique: vi.fn().mockResolvedValue({
              id: orderId,
              orderNumber: '1001',
              type: 'DINE_IN',
              status: OrderStatus.PREPARING,
              branchId,
              paymentMethod: PaymentMethod.CASH,
              paymentStatus: PaymentStatus.PAID,
              totalMinor: 15000,
              customerId: null,
            }),
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new UpdateOrderStatusUseCase(mockDb as any);

    await expect(
      useCase.execute({
        orderId,
        nextStatus: OrderStatus.CANCELLED,
        cancelReason: 'لا', // Only 2 chars
        userId,
        userPermissions: [PermissionCode.VOID_PAID_ORDER],
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ConflictError on concurrent cancellation if status changed from another station', async () => {
    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const mockTx = {
          order: {
            findUnique: vi.fn().mockResolvedValue({
              id: orderId,
              orderNumber: '1001',
              type: 'DINE_IN',
              status: OrderStatus.PREPARING,
              branchId,
              paymentMethod: PaymentMethod.CASH,
              paymentStatus: PaymentStatus.PAID,
              totalMinor: 15000,
              customerId: null,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // Concurrently updated!
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new UpdateOrderStatusUseCase(mockDb as any);

    await expect(
      useCase.execute({
        orderId,
        nextStatus: OrderStatus.CANCELLED,
        cancelReason: 'طلب تم إلغاؤه من الكاشير',
        userId,
        userPermissions: [PermissionCode.VOID_PAID_ORDER],
      })
    ).rejects.toThrow(ConflictError);
  });

  it('creates ReturnInvoice and CASH_REFUND CashShiftMovement on operator shift for CASH paid order', async () => {
    let createdInvoice: any = null;
    let createdMovement: any = null;

    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const mockTx = {
          $executeRawUnsafe: vi.fn().mockResolvedValue(1),
          $queryRawUnsafe: vi.fn().mockResolvedValue([{ val: 1005 }]),
          order: {
            findUnique: vi.fn().mockResolvedValue({
              id: orderId,
              orderNumber: '1001',
              type: 'DINE_IN',
              status: OrderStatus.PREPARING,
              branchId,
              paymentMethod: PaymentMethod.CASH,
              paymentStatus: PaymentStatus.PAID,
              totalMinor: 15000,
              customerId: null,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              id: orderId,
              orderNumber: '1001',
              status: OrderStatus.CANCELLED,
              paymentStatus: PaymentStatus.REFUNDED,
              taxRatePercent: 14,
            }),
          },
          returnInvoice: {
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              createdInvoice = data;
              return { id: 'ret-inv-1', ...data };
            }),
          },
          cashShift: {
            findFirst: vi.fn().mockResolvedValue({
              id: shiftId,
              branchId,
              cashierId: userId,
              status: 'OPEN',
            }),
          },
          cashShiftMovement: {
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              createdMovement = data;
              return { id: 'mov-1', ...data };
            }),
          },
          inventoryMovement: {
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        };
        return cb(mockTx);
      }),
    };

    const useCase = new UpdateOrderStatusUseCase(mockDb as any);
    await useCase.execute({
      orderId,
      nextStatus: OrderStatus.CANCELLED,
      cancelReason: 'إلغاء واسترجاع بطلب العميل',
      userId,
      userPermissions: [PermissionCode.VOID_PAID_ORDER],
    });

    expect(createdInvoice).not.toBeNull();
    expect(createdInvoice.returnNumber).toBe('RET-1005');
    expect(createdInvoice.amountMinor).toBe(15000);

    expect(createdMovement).not.toBeNull();
    expect(createdMovement.type).toBe('CASH_REFUND');
    expect(createdMovement.amountMinor).toBe(15000);
    expect(createdMovement.cashShiftId).toBe(shiftId);
  });

  it('CashShiftCalculatorService deducts cash refunds from expected cash', () => {
    const opening = Money.fromMinor(10000, 'EGP');
    const sales = Money.fromMinor(50000, 'EGP');
    const cashIn = Money.fromMinor(5000, 'EGP');
    const cashDrop = Money.fromMinor(10000, 'EGP');
    const expenses = Money.fromMinor(5000, 'EGP');
    const refunds = Money.fromMinor(8000, 'EGP');

    const expectedWithRefund = CashShiftCalculatorService.calculateExpectedCash({
      openingCash: opening,
      cashSales: sales,
      cashInTotal: cashIn,
      cashDropTotal: cashDrop,
      registerExpensesTotal: expenses,
      cashRefundsTotal: refunds,
    });

    // 10000 + 50000 + 5000 - 10000 - 5000 - 8000 = 42000
    expect(expectedWithRefund.amount).toBe(42000);
  });
});
