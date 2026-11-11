import { describe, it, expect, vi } from 'vitest';
import { OpenTableTabUseCase } from '../../src/application/tables/use-cases/open-table-tab.use-case';
import { CloseTableTabUseCase } from '../../src/application/tables/use-cases/close-table-tab.use-case';
import { ManageTablesUseCase } from '../../src/application/tables/use-cases/manage-tables.use-case';
import { TableStatus } from '../../src/domain/tables/enums';
import { ValidationError, ForbiddenError } from '../../src/domain/shared/errors/domain-error';
import { PaymentMethod } from '../../src/domain/ordering/enums';
import type { PrismaClient } from '@prisma/client';

describe('B2: Table Tab Shift Ownership and Table Status Lifecycle', () => {
  describe('OpenTableTabUseCase - Shift Ownership & Scoping', () => {
    it('rejects opening a tab if the shift belongs to a different cashier', async () => {
      const tableId = crypto.randomUUID();
      const branchId = crypto.randomUUID();
      const shiftId = crypto.randomUUID();
      const myCashierId = crypto.randomUUID();
      const otherCashierId = crypto.randomUUID();

      const mockTable = {
        id: tableId,
        tableNumber: 'T1',
        branchId,
        isActive: true,
        status: TableStatus.AVAILABLE,
      };

      const mockShift = {
        id: shiftId,
        branchId,
        cashierId: otherCashierId, // Not matching current cashier
        status: 'OPEN',
      };

      const mockPrisma = {
        diningTable: { findUnique: vi.fn().mockResolvedValue(mockTable) },
        cashShift: { findUnique: vi.fn().mockResolvedValue(mockShift) },
        restaurantSetting: { findFirst: vi.fn().mockResolvedValue({ currency: 'EGP', taxRatePercent: 14 }) },
      };

      const useCase = new OpenTableTabUseCase(mockPrisma as unknown as PrismaClient);

      await expect(
        useCase.execute({
          tableId,
          branchId,
          cashShiftId: shiftId,
          cashierId: myCashierId,
          guestCount: 2,
          items: [],
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects opening a tab if the shift belongs to a different branch than the table', async () => {
      const tableId = crypto.randomUUID();
      const branchId = crypto.randomUUID();
      const foreignBranchId = crypto.randomUUID();
      const shiftId = crypto.randomUUID();
      const myCashierId = crypto.randomUUID();

      const mockTable = {
        id: tableId,
        tableNumber: 'T1',
        branchId,
        isActive: true,
        status: TableStatus.AVAILABLE,
      };

      const mockShift = {
        id: shiftId,
        branchId: foreignBranchId, // Different branch
        cashierId: myCashierId,
        status: 'OPEN',
      };

      const mockPrisma = {
        diningTable: { findUnique: vi.fn().mockResolvedValue(mockTable) },
        cashShift: { findUnique: vi.fn().mockResolvedValue(mockShift) },
        restaurantSetting: { findFirst: vi.fn().mockResolvedValue({ currency: 'EGP', taxRatePercent: 14 }) },
      };

      const useCase = new OpenTableTabUseCase(mockPrisma as unknown as PrismaClient);

      await expect(
        useCase.execute({
          tableId,
          branchId,
          cashShiftId: shiftId,
          cashierId: myCashierId,
          guestCount: 2,
          items: [],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('CloseTableTabUseCase - Shift Ownership & Scoping', () => {
    it('rejects closing a tab and receiving payment on another cashiers shift', async () => {
      const tableId = crypto.randomUUID();
      const branchId = crypto.randomUUID();
      const orderId = crypto.randomUUID();
      const shiftId = crypto.randomUUID();
      const myCashierId = crypto.randomUUID();
      const otherCashierId = crypto.randomUUID();

      const mockTable = {
        id: tableId,
        tableNumber: 'T1',
        branchId,
        isActive: true,
        status: TableStatus.OCCUPIED,
        activeOrderId: orderId,
      };

      const mockOrder = {
        id: orderId,
        isTabOpen: true,
        totalMinor: 10000,
      };

      const mockShift = {
        id: shiftId,
        branchId,
        cashierId: otherCashierId, // Different cashier
        status: 'OPEN',
      };

      const mockPrisma = {
        diningTable: { findUnique: vi.fn().mockResolvedValue(mockTable) },
        order: { findUnique: vi.fn().mockResolvedValue(mockOrder) },
        cashShift: { findUnique: vi.fn().mockResolvedValue(mockShift) },
      };

      const useCase = new CloseTableTabUseCase(mockPrisma as unknown as PrismaClient);

      await expect(
        useCase.execute({
          tableId,
          orderId,
          cashShiftId: shiftId,
          cashierId: myCashierId,
          paymentMethod: PaymentMethod.CASH,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('ManageTablesUseCase - Table Status Lifecycle Guard', () => {
    it('prevents changing status of an occupied table when activeOrderId exists', async () => {
      const tableId = crypto.randomUUID();
      const branchId = crypto.randomUUID();
      const orderId = crypto.randomUUID();

      const mockTable = {
        id: tableId,
        tableNumber: 'T1',
        branchId,
        isActive: true,
        status: TableStatus.OCCUPIED,
        activeOrderId: orderId,
      };

      const mockPrisma = {
        diningTable: {
          findUnique: vi.fn().mockResolvedValue(mockTable),
          update: vi.fn(),
        },
      };

      const useCase = new ManageTablesUseCase(mockPrisma as unknown as PrismaClient);

      await expect(
        useCase.update({
          id: tableId,
          status: TableStatus.AVAILABLE,
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
