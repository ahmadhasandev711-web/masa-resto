import { describe, it, expect, vi } from 'vitest';
import { PrismaFinanceRepository } from '../../src/infrastructure/finance/prisma-finance.repository';
import { CashShiftStatus, ExpenseSource } from '../../src/domain/finance/enums';
import { ValidationError, ConflictError } from '../../src/domain/shared/errors/domain-error';
import { prisma } from '../../src/infrastructure/db/prisma';

describe('B4: Finance Segregation of Duties and Shift Audit Protection', () => {
  describe('auditShift', () => {
    it('rejects self-audit when approverId is identical to shift cashierId', async () => {
      const cashierId = crypto.randomUUID();
      const shiftId = crypto.randomUUID();
      const branchId = crypto.randomUUID();

      const mockShift = {
        id: shiftId,
        branchId,
        cashierId,
        status: CashShiftStatus.CLOSED,
      };

      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        cashShift: {
          findUnique: vi.fn().mockResolvedValue(mockShift),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) =>
        (cb as (tx: unknown) => Promise<unknown>)(mockTx)
      );

      const repo = new PrismaFinanceRepository();

      await expect(
        repo.auditShift({
          shiftId,
          branchId,
          approverId: cashierId, // Same cashier trying to audit own shift!
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects re-auditing a shift that is already in AUDITED status', async () => {
      const cashierId = crypto.randomUUID();
      const approverId = crypto.randomUUID();
      const shiftId = crypto.randomUUID();
      const branchId = crypto.randomUUID();

      const mockShift = {
        id: shiftId,
        branchId,
        cashierId,
        status: CashShiftStatus.AUDITED, // Already audited!
      };

      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        cashShift: {
          findUnique: vi.fn().mockResolvedValue(mockShift),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const repo = new PrismaFinanceRepository();

      await expect(
        repo.auditShift({
          shiftId,
          branchId,
          approverId,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('createExpense', () => {
    it('rejects dispensing cash from another cashiers shift without manager approval', async () => {
      const branchId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const shiftId = crypto.randomUUID();
      const spentById = crypto.randomUUID();
      const anotherCashierId = crypto.randomUUID();

      const mockShift = {
        id: shiftId,
        branchId,
        cashierId: anotherCashierId, // Belongs to someone else
        status: CashShiftStatus.OPEN,
      };

      const mockTx = {
        cashShift: {
          findUnique: vi.fn().mockResolvedValue(mockShift),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const repo = new PrismaFinanceRepository();

      await expect(
        repo.createExpense({
          branchId,
          categoryId,
          amountMinor: 5000,
          currency: 'EGP',
          source: ExpenseSource.REGISTER_CASH,
          description: 'Office supplies',
          spentById,
          cashShiftId: shiftId,
          // approvedById is omitted!
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
