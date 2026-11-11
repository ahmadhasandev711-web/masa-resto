import { describe, expect, it, vi } from 'vitest';
import { GetSalesAnalyticsUseCase } from '../../src/application/reports/use-cases/get-sales-analytics.use-case';
import { ValidationError } from '../../src/domain/shared/errors/domain-error';
import { PrismaClient } from '@prisma/client';

describe('C7: Financial Reporting and Shift Analytics (H7)', () => {
  describe('GetSalesAnalyticsUseCase Date Range & Validation', () => {
    it('rejects date range exceeding 366 days with ValidationError', async () => {
      const useCase = new GetSalesAnalyticsUseCase({} as PrismaClient);
      const startDate = new Date('2025-01-01T00:00:00Z');
      const endDate = new Date('2026-01-05T00:00:00Z'); // 369 days

      await expect(
        useCase.execute({ startDate, endDate })
      ).rejects.toThrow(ValidationError);
      await expect(
        useCase.execute({ startDate, endDate })
      ).rejects.toThrow('366');
    });

    it('rejects inverted date range (endDate < startDate) with ValidationError', async () => {
      const useCase = new GetSalesAnalyticsUseCase({} as PrismaClient);
      const startDate = new Date('2026-05-01T00:00:00Z');
      const endDate = new Date('2026-04-01T00:00:00Z');

      await expect(
        useCase.execute({ startDate, endDate })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('GetSalesAnalyticsUseCase Financial Integrity & Net Sales Definition', () => {
    it('calculates netSalesMinor = subtotal - discount and reports tax, service, delivery separately', async () => {
      const mockPrisma = {
        restaurantSetting: {
          findFirst: vi.fn().mockResolvedValue({ currency: 'EGP' }),
        },
        order: {
          aggregate: vi.fn().mockResolvedValue({
            _count: { id: 10 },
            _sum: {
              totalMinor: 115000,
              subtotalMinor: 100000,
              discountMinor: 10000,
              taxMinor: 14000,
              serviceMinor: 6000,
              deliveryFeeMinor: 5000,
            },
          }),
          groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) => {
            if (by.includes('type')) {
              return Promise.resolve([
                { type: 'DINE_IN', _count: { id: 6 }, _sum: { totalMinor: 70000 } },
                { type: 'TAKEAWAY', _count: { id: 4 }, _sum: { totalMinor: 45000 } },
              ]);
            }
            if (by.includes('paymentMethod')) {
              return Promise.resolve([
                { paymentMethod: 'CASH', _count: { id: 7 }, _sum: { totalMinor: 80000 } },
                { paymentMethod: 'CARD', _count: { id: 3 }, _sum: { totalMinor: 35000 } },
              ]);
            }
            return Promise.resolve([]);
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;

      const useCase = new GetSalesAnalyticsUseCase(mockPrisma);
      const startDate = new Date('2026-01-01T00:00:00Z');
      const endDate = new Date('2026-01-10T23:59:59Z');

      const result = await useCase.execute({ startDate, endDate });

      // Net Sales must strictly be subtotal - discount (100,000 - 10,000 = 90,000)
      expect(result.subtotalMinor).toBe(100000);
      expect(result.discountMinor).toBe(10000);
      expect(result.netSalesMinor).toBe(90000);

      // Separate lines for tax, service, delivery, and total revenue
      expect(result.taxMinor).toBe(14000);
      expect(result.serviceMinor).toBe(6000);
      expect(result.deliveryFeeMinor).toBe(5000);
      expect(result.totalRevenueMinor).toBe(115000);
      expect(result.totalOrders).toBe(10);
      expect(result.averageOrderValueMinor).toBe(11500); // 115,000 / 10
    });

    it('groups daily and hourly breakdown strictly according to Africa/Cairo local time', async () => {
      // 2026-06-15T22:30:00Z in UTC is:
      // In Cairo (UTC+3 during summer DST): 2026-06-16 at 01:30 (Day 16, Hour 1)
      const dateUtcNight = new Date('2026-06-15T22:30:00.000Z');

      const mockPrisma = {
        restaurantSetting: {
          findFirst: vi.fn().mockResolvedValue({ currency: 'EGP' }),
        },
        order: {
          aggregate: vi.fn().mockResolvedValue({
            _count: { id: 1 },
            _sum: {
              totalMinor: 5000,
              subtotalMinor: 5000,
              discountMinor: 0,
              taxMinor: 0,
              serviceMinor: 0,
              deliveryFeeMinor: 0,
            },
          }),
          groupBy: vi.fn().mockResolvedValue([]),
          findMany: vi.fn().mockResolvedValue([
            { createdAt: dateUtcNight, totalMinor: 5000 },
          ]),
        },
      } as unknown as PrismaClient;

      const useCase = new GetSalesAnalyticsUseCase(mockPrisma);
      const result = await useCase.execute({
        startDate: new Date('2026-06-15T00:00:00Z'),
        endDate: new Date('2026-06-17T00:00:00Z'),
      });

      // Hour in Cairo should be 1 (01:00)
      const hourEntry = result.hourly.find((h) => h.hour === 1);
      expect(hourEntry?.count).toBe(1);
      expect(hourEntry?.totalMinor).toBe(5000);

      // Day in Cairo should be 2026-06-16 (not 2026-06-15!)
      const dayEntry = result.daily.find((d) => d.date === '2026-06-16');
      expect(dayEntry).toBeDefined();
      expect(dayEntry?.count).toBe(1);
      expect(dayEntry?.totalMinor).toBe(5000);
    });
  });

  describe('PrismaFinanceRepository Shift Reports Sales Aggregations', () => {
    it('listShifts filters out CANCELLED and REJECTED orders from sales counts and totals', async () => {
      const { PrismaFinanceRepository } = await import(
        '../../src/infrastructure/finance/prisma-finance.repository'
      );
      const repo = new PrismaFinanceRepository();

      // Verify the query structure passed to prisma.cashShift.findMany
      const { prisma } = await import('../../src/infrastructure/db/prisma');
      const spyFindMany = vi.spyOn(prisma.cashShift, 'findMany').mockResolvedValueOnce([
        {
          id: 'shift-1',
          branchId: 'branch-1',
          cashierId: 'cashier-1',
          status: 'CLOSED',
          currency: 'EGP',
          openingCashMinor: 10000,
          closingCashMinor: 25000,
          expectedCashMinor: 25000,
          varianceMinor: 0,
          varianceReason: null,
          openedAt: new Date(),
          closedAt: new Date(),
          approvedAt: null,
          cashier: { fullName: 'Ali Cashier' },
          branch: { nameAr: 'فرع الدقي' },
          approver: null,
          orders: [
            {
              id: 'order-1',
              totalMinor: 15000,
              payments: [{ method: 'CASH', amountMinor: 15000 }],
            },
          ],
        } as never,
      ]);

      const shifts = await repo.listShifts({ branchId: 'branch-1' });

      expect(spyFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            orders: {
              where: {
                status: { notIn: ['CANCELLED', 'REJECTED'] },
              },
              select: {
                id: true,
                totalMinor: true,
                payments: { select: { method: true, amountMinor: true } },
              },
            },
          }),
        })
      );

      expect(shifts[0].totalSalesMinor).toBe(15000);
      expect(shifts[0].cashSalesMinor).toBe(15000);
      spyFindMany.mockRestore();
    });
  });
});
