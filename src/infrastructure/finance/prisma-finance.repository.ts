import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import {
  FinanceRepository,
  CashShiftListItem,
  CashShiftDetail,
  ShiftMovementRecord,
  ExpenseListItem,
  ExpenseCategoryItem,
  ProfitAndLossReport,
  DailySalesAndCogs,
} from '../../domain/finance/contracts/finance.repository';
import { CashMovementType, ExpenseSource, CashShiftStatus } from '../../domain/finance/enums';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/shared/errors/domain-error';
import { Money } from '../../domain/shared/value-objects/money';
import { CashShiftCalculatorService } from '../../domain/finance/services/cash-shift-calculator.service';
import { ProfitabilityCalculatorService } from '../../domain/finance/services/profitability-calculator.service';
import { PaymentMethod, OrderStatus } from '../../domain/ordering/enums';

export class PrismaFinanceRepository implements FinanceRepository {
  public async listShifts(params: {
    branchId: string;
    status?: CashShiftStatus;
    cashierId?: string;
    limit?: number;
  }): Promise<CashShiftListItem[]> {
    const where: Prisma.CashShiftWhereInput = {
      branchId: params.branchId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.cashierId ? { cashierId: params.cashierId } : {}),
    };

    const shifts = await prisma.cashShift.findMany({
      where,
      take: params.limit ?? 50,
      orderBy: { openedAt: 'desc' },
      include: {
        cashier: { select: { fullName: true } },
        branch: { select: { nameAr: true } },
        approver: { select: { fullName: true } },
        orders: {
          where: {
            status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REJECTED] },
          },
          select: {
            id: true,
            totalMinor: true,
            payments: { select: { method: true, amountMinor: true } },
          },
        },
      },
    });

    return shifts.map((shift) => {
      let cashSalesMinor = 0;
      let cardSalesMinor = 0;
      let totalSalesMinor = 0;

      for (const order of shift.orders) {
        totalSalesMinor += order.totalMinor;
        for (const payment of order.payments) {
          if (payment.method === PaymentMethod.CASH) {
            cashSalesMinor += payment.amountMinor;
          } else if (payment.method === PaymentMethod.CARD) {
            cardSalesMinor += payment.amountMinor;
          }
        }
      }

      return {
        id: shift.id,
        branchId: shift.branchId,
        branchNameAr: shift.branch.nameAr,
        cashierId: shift.cashierId,
        cashierName: shift.cashier.fullName,
        status: shift.status as CashShiftStatus,
        currency: shift.currency ?? 'EGP',
        openingCashMinor: shift.openingCashMinor,
        closingCashMinor: shift.closingCashMinor,
        expectedCashMinor: shift.expectedCashMinor,
        varianceMinor: shift.varianceMinor,
        varianceReason: shift.varianceReason,
        openedAt: shift.openedAt.toISOString(),
        closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
        approvedByName: shift.approver?.fullName ?? null,
        approvedAt: shift.approvedAt ? shift.approvedAt.toISOString() : null,
        totalOrdersCount: shift.orders.length,
        totalSalesMinor,
        cashSalesMinor,
        cardSalesMinor,
      };
    });
  }

  public async getShiftDetails(shiftId: string, branchId?: string): Promise<CashShiftDetail | null> {
    const shift = await prisma.cashShift.findFirst({
      where: {
        id: shiftId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        cashier: { select: { fullName: true } },
        branch: { select: { nameAr: true } },
        approver: { select: { fullName: true } },
        movements: {
          include: { performedBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        expenses: {
          include: {
            category: { select: { nameAr: true } },
            spentBy: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          select: {
            id: true,
            totalMinor: true,
            payments: { select: { method: true, amountMinor: true } },
          },
        },
      },
    });

    if (!shift) return null;

    let cashSalesMinor = 0;
    let cardSalesMinor = 0;
    let totalSalesMinor = 0;

    for (const order of shift.orders) {
      totalSalesMinor += order.totalMinor;
      for (const payment of order.payments) {
        if (payment.method === PaymentMethod.CASH) {
          cashSalesMinor += payment.amountMinor;
        } else if (payment.method === PaymentMethod.CARD) {
          cardSalesMinor += payment.amountMinor;
        }
      }
    }

    let cashInMinor = 0;
    let cashDropMinor = 0;
    for (const m of shift.movements) {
      if (m.type === CashMovementType.CASH_IN) {
        cashInMinor += m.amountMinor;
      } else if (m.type === CashMovementType.CASH_DROP) {
        cashDropMinor += m.amountMinor;
      }
    }

    let registerExpensesMinor = 0;
    for (const exp of shift.expenses) {
      registerExpensesMinor += exp.amountMinor;
    }

    return {
      id: shift.id,
      branchId: shift.branchId,
      branchNameAr: shift.branch.nameAr,
      cashierId: shift.cashierId,
      cashierName: shift.cashier.fullName,
      status: shift.status as CashShiftStatus,
      currency: shift.currency ?? 'EGP',
      openingCashMinor: shift.openingCashMinor,
      closingCashMinor: shift.closingCashMinor,
      expectedCashMinor: shift.expectedCashMinor,
      varianceMinor: shift.varianceMinor,
      varianceReason: shift.varianceReason,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
      approvedByName: shift.approver?.fullName ?? null,
      approvedAt: shift.approvedAt ? shift.approvedAt.toISOString() : null,
      totalOrdersCount: shift.orders.length,
      totalSalesMinor,
      cashSalesMinor,
      cardSalesMinor,
      cashInMinor,
      cashDropMinor,
      registerExpensesMinor,
      movements: shift.movements.map((m) => ({
        id: m.id,
        type: m.type as CashMovementType,
        amountMinor: m.amountMinor,
        reason: m.reason,
        performedByName: m.performedBy.fullName,
        createdAt: m.createdAt.toISOString(),
      })),
      drawerExpenses: shift.expenses.map((e) => ({
        id: e.id,
        categoryNameAr: e.category.nameAr,
        amountMinor: e.amountMinor,
        description: e.description,
        receiptNumber: e.receiptNumber,
        spentByName: e.spentBy.fullName,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  public async getActiveShift(branchId: string, cashierId: string): Promise<CashShiftDetail | null> {
    const shift = await prisma.cashShift.findFirst({
      where: { branchId, cashierId, status: CashShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });
    if (!shift) return null;
    return this.getShiftDetails(shift.id, branchId);
  }

  public async recordMovement(params: {
    shiftId: string;
    branchId: string;
    type: CashMovementType;
    amountMinor: number;
    reason: string;
    performedById: string;
  }): Promise<ShiftMovementRecord> {
    return prisma.$transaction(
      async (client) => {
        // Lock shift
        await client.$queryRaw(
          Prisma.sql`SELECT id, status, branch_id FROM cash_shifts WHERE id = ${params.shiftId} FOR UPDATE`
        );

        const shift = await client.cashShift.findUnique({
          where: { id: params.shiftId },
        });

        if (!shift) {
          throw new NotFoundError('الوردية المطلوبة غير موجودة');
        }
        if (shift.branchId !== params.branchId) {
          throw new ConflictError('الوردية لا تتبع الفرع المحدد');
        }
        if (shift.status !== CashShiftStatus.OPEN) {
          throw new ConflictError('لا يمكن تسجيل حركة نقدية على وردية مغلقة');
        }

        const performer = await client.user.findUnique({
          where: { id: params.performedById },
          select: { fullName: true },
        });

        const movement = await client.cashShiftMovement.create({
          data: {
            cashShiftId: params.shiftId,
            type: params.type,
            amountMinor: params.amountMinor,
            reason: params.reason,
            performedById: params.performedById,
          },
        });

        return {
          id: movement.id,
          type: movement.type as CashMovementType,
          amountMinor: movement.amountMinor,
          reason: movement.reason,
          performedByName: performer?.fullName ?? 'موظف',
          createdAt: movement.createdAt.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public async blindCloseShift(params: {
    shiftId: string;
    branchId: string;
    cashierId: string;
    countedCashMinor: number;
    varianceReason?: string;
  }): Promise<CashShiftDetail> {
    return prisma.$transaction(
      async (client) => {
        // Lock shift
        await client.$queryRaw(
          Prisma.sql`SELECT id, status, branch_id, cashier_id FROM cash_shifts WHERE id = ${params.shiftId} FOR UPDATE`
        );

        const shift = await client.cashShift.findUnique({
          where: { id: params.shiftId },
        });

        if (!shift) {
          throw new NotFoundError('الوردية غير موجودة');
        }
        if (shift.branchId !== params.branchId) {
          throw new ConflictError('الوردية لا تتبع الفرع المحدد');
        }
        if (shift.status !== CashShiftStatus.OPEN) {
          throw new ConflictError('الوردية مغلقة بالفعل');
        }

        const currency = shift.currency ?? 'EGP';

        // 1. Calculate Cash Sales from POS
        const cashPayments = await client.orderPayment.aggregate({
          where: {
            method: PaymentMethod.CASH,
            order: { cashShiftId: shift.id },
          },
          _sum: { amountMinor: true },
        });
        const cashSalesMinor = cashPayments._sum.amountMinor ?? 0;

        // 2. Calculate Movements (Cash In / Drop / Refund)
        const movements = await client.cashShiftMovement.findMany({
          where: { cashShiftId: shift.id },
        });
        let cashInMinor = 0;
        let cashDropMinor = 0;
        let cashRefundMinor = 0;
        for (const m of movements) {
          if (m.type === CashMovementType.CASH_IN) {
            cashInMinor += m.amountMinor;
          } else if (m.type === CashMovementType.CASH_DROP) {
            cashDropMinor += m.amountMinor;
          } else if (m.type === CashMovementType.CASH_REFUND) {
            cashRefundMinor += m.amountMinor;
          }
        }

        // 3. Calculate Register Expenses
        const expenses = await client.expense.aggregate({
          where: { cashShiftId: shift.id },
          _sum: { amountMinor: true },
        });
        const registerExpensesMinor = expenses._sum.amountMinor ?? 0;

        // 4. Calculate Expected Cash using Domain Service
        const expectedCash = CashShiftCalculatorService.calculateExpectedCash({
          openingCash: Money.fromMinor(shift.openingCashMinor, currency),
          cashSales: Money.fromMinor(cashSalesMinor, currency),
          cashInTotal: Money.fromMinor(cashInMinor, currency),
          cashDropTotal: Money.fromMinor(cashDropMinor, currency),
          registerExpensesTotal: Money.fromMinor(registerExpensesMinor, currency),
          cashRefundsTotal: Money.fromMinor(cashRefundMinor, currency),
        });

        // 5. Analyze Variance
        const countedCash = Money.fromMinor(params.countedCashMinor, currency);
        const analysis = CashShiftCalculatorService.analyzeVariance(countedCash, expectedCash);

        // 6. Update Shift to CLOSED
        await client.cashShift.update({
          where: { id: shift.id },
          data: {
            status: CashShiftStatus.CLOSED,
            closingCashMinor: params.countedCashMinor,
            expectedCashMinor: expectedCash.amount,
            varianceMinor: analysis.variance.amount,
            varianceReason: params.varianceReason || null,
            closedAt: new Date(),
          },
        });

        const detail = await this.getShiftDetails(shift.id, params.branchId);
        if (!detail) throw new Error('فشل جلب تفاصيل الوردية بعد الإغلاق');
        return detail;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public async auditShift(params: {
    shiftId: string;
    branchId: string;
    approverId: string;
    notes?: string;
  }): Promise<CashShiftDetail> {
    return prisma.$transaction(
      async (client) => {
        // Lock shift
        await client.$queryRaw(
          Prisma.sql`SELECT id, status, branch_id FROM cash_shifts WHERE id = ${params.shiftId} FOR UPDATE`
        );

        const shift = await client.cashShift.findUnique({
          where: { id: params.shiftId },
        });

        if (!shift) {
          throw new NotFoundError('الوردية غير موجودة');
        }
        if (shift.branchId !== params.branchId) {
          throw new ConflictError('الوردية لا تتبع الفرع المحدد');
        }
        if (shift.status === CashShiftStatus.OPEN) {
          throw new ConflictError('يجب إغلاق الوردية قبل اعتمادها وتدقيقها');
        }
        if (shift.status === CashShiftStatus.AUDITED) {
          throw new ConflictError('الوردية معتمدة ومدققة بالفعل');
        }
        if (shift.cashierId === params.approverId) {
          throw new ValidationError('لا يمكن للكاشير تدقيق واعتماد ورديته بنفسه (فصل المهام)');
        }

        const updatedVarianceReason = params.notes
          ? shift.varianceReason
            ? `${shift.varianceReason} | ملاحظة المدير: ${params.notes}`
            : `ملاحظة المدير: ${params.notes}`
          : shift.varianceReason;

        await client.cashShift.update({
          where: { id: shift.id },
          data: {
            status: CashShiftStatus.AUDITED,
            approvedById: params.approverId,
            approvedAt: new Date(),
            varianceReason: updatedVarianceReason,
          },
        });

        const detail = await this.getShiftDetails(shift.id, params.branchId);
        if (!detail) throw new Error('فشل جلب تفاصيل الوردية بعد الاعتماد');
        return detail;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public async listExpenses(params: {
    branchId: string;
    categoryId?: string;
    source?: ExpenseSource;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<ExpenseListItem[]> {
    const where: Prisma.ExpenseWhereInput = {
      branchId: params.branchId,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(params.fromDate || params.toDate
        ? {
            createdAt: {
              ...(params.fromDate ? { gte: params.fromDate } : {}),
              ...(params.toDate ? { lte: params.toDate } : {}),
            },
          }
        : {}),
    };

    const expenses = await prisma.expense.findMany({
      where,
      take: params.limit ?? 100,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { nameAr: true } },
        category: { select: { nameAr: true, nameEn: true } },
        spentBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
    });

    return expenses.map((e) => ({
      id: e.id,
      branchId: e.branchId,
      branchNameAr: e.branch.nameAr,
      categoryId: e.categoryId,
      categoryNameAr: e.category.nameAr,
      categoryNameEn: e.category.nameEn,
      amountMinor: e.amountMinor,
      currency: e.currency,
      source: e.source as ExpenseSource,
      description: e.description,
      receiptNumber: e.receiptNumber,
      spentById: e.spentById,
      spentByName: e.spentBy.fullName,
      approvedById: e.approvedById,
      approvedByName: e.approvedBy?.fullName ?? null,
      cashShiftId: e.cashShiftId,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  public async createExpense(params: {
    branchId: string;
    categoryId: string;
    amountMinor: number;
    currency: string;
    source: ExpenseSource;
    description: string;
    receiptNumber?: string;
    spentById: string;
    cashShiftId?: string;
    approvedById?: string;
  }): Promise<ExpenseListItem> {
    return prisma.$transaction(
      async (client) => {
        let assignedShiftId: string | null = null;

        if (params.source === ExpenseSource.REGISTER_CASH) {
          if (params.cashShiftId) {
            const shift = await client.cashShift.findUnique({
              where: { id: params.cashShiftId },
            });
            if (!shift || shift.branchId !== params.branchId) {
              throw new ConflictError('الوردية المحددة غير صحيحة أو لا تتبع الفرع');
            }
            if (shift.status !== CashShiftStatus.OPEN) {
              throw new ConflictError('الوردية المحددة للصرف مغلقة');
            }
            if (shift.cashierId !== params.spentById && !params.approvedById) {
              throw new ValidationError('الصرف من وردية كاشير آخر يتطلب اعتماد المدير المالي');
            }
            assignedShiftId = shift.id;
          } else {
            // Find active open shift for spentById
            const activeShift = await client.cashShift.findFirst({
              where: {
                branchId: params.branchId,
                cashierId: params.spentById,
                status: CashShiftStatus.OPEN,
              },
              orderBy: { openedAt: 'desc' },
            });
            if (!activeShift) {
              throw new ValidationError(
                'لا توجد وردية كاشير مفتوحة للموظف في هذا الفرع؛ يرجى فتح وردية أولاً أو اختيار الصرف من الخزينة'
              );
            }
            assignedShiftId = activeShift.id;
          }
        }

        const expense = await client.expense.create({
          data: {
            branchId: params.branchId,
            categoryId: params.categoryId,
            amountMinor: params.amountMinor,
            currency: params.currency,
            source: params.source,
            description: params.description,
            receiptNumber: params.receiptNumber || null,
            spentById: params.spentById,
            approvedById: params.approvedById || null,
            cashShiftId: assignedShiftId,
          },
          include: {
            branch: { select: { nameAr: true } },
            category: { select: { nameAr: true, nameEn: true } },
            spentBy: { select: { fullName: true } },
            approvedBy: { select: { fullName: true } },
          },
        });

        return {
          id: expense.id,
          branchId: expense.branchId,
          branchNameAr: expense.branch.nameAr,
          categoryId: expense.categoryId,
          categoryNameAr: expense.category.nameAr,
          categoryNameEn: expense.category.nameEn,
          amountMinor: expense.amountMinor,
          currency: expense.currency,
          source: expense.source as ExpenseSource,
          description: expense.description,
          receiptNumber: expense.receiptNumber,
          spentById: expense.spentById,
          spentByName: expense.spentBy.fullName,
          approvedById: expense.approvedById,
          approvedByName: expense.approvedBy?.fullName ?? null,
          cashShiftId: expense.cashShiftId,
          createdAt: expense.createdAt.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public async listCategories(): Promise<ExpenseCategoryItem[]> {
    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return categories.map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      description: c.description,
      isActive: c.isActive,
    }));
  }

  public async getProfitAndLoss(params: {
    branchId?: string;
    fromDate: Date;
    toDate: Date;
  }): Promise<ProfitAndLossReport> {
    const settings = await prisma.restaurantSetting.findFirst();
    const currency = settings?.currency ?? 'EGP';
    const currencySymbol = settings?.currencySymbol ?? 'ج.م';

    const branchFilter = params.branchId ? { branchId: params.branchId } : {};

    // 1. Fetch completed/delivered orders
    const orders = await prisma.order.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: params.fromDate, lte: params.toDate },
        status: { in: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] },
      },
      select: {
        id: true,
        totalMinor: true,
        createdAt: true,
      },
    });

    let netSalesMinor = 0;
    const dailyMap = new Map<string, { sales: number; cogs: number; expenses: number }>();

    for (const o of orders) {
      netSalesMinor += o.totalMinor;
      const day = o.createdAt.toISOString().slice(0, 10);
      const cur = dailyMap.get(day) ?? { sales: 0, cogs: 0, expenses: 0 };
      cur.sales += o.totalMinor;
      dailyMap.set(day, cur);
    }

    // 2. Fetch COGS from InventoryMovements of type 'SALE_POS' and 'SALE_ONLINE'
    const cogsMovements = await prisma.inventoryMovement.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: params.fromDate, lte: params.toDate },
        type: { in: ['SALE_POS', 'SALE_ONLINE'] },
      },
      select: {
        quantityDelta: true,
        unitCostMinor: true,
        createdAt: true,
      },
    });

    let cogsMinor = 0;
    for (const mov of cogsMovements) {
      const qty = Math.abs(Number(mov.quantityDelta));
      const lineCost = Math.round(qty * (mov.unitCostMinor ?? 0));
      cogsMinor += lineCost;
      const day = mov.createdAt.toISOString().slice(0, 10);
      const cur = dailyMap.get(day) ?? { sales: 0, cogs: 0, expenses: 0 };
      cur.cogs += lineCost;
      dailyMap.set(day, cur);
    }

    // 3. Fetch Expenses
    const expenses = await prisma.expense.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: params.fromDate, lte: params.toDate },
      },
      include: {
        category: { select: { nameAr: true } },
      },
    });

    let operatingExpensesMinor = 0;
    const categoryExpensesMap = new Map<string, number>();

    for (const exp of expenses) {
      operatingExpensesMinor += exp.amountMinor;
      const catName = exp.category.nameAr;
      categoryExpensesMap.set(catName, (categoryExpensesMap.get(catName) ?? 0) + exp.amountMinor);

      const day = exp.createdAt.toISOString().slice(0, 10);
      const cur = dailyMap.get(day) ?? { sales: 0, cogs: 0, expenses: 0 };
      cur.expenses += exp.amountMinor;
      dailyMap.set(day, cur);
    }

    // 4. Calculate Metrics using Domain Service
    const metrics = ProfitabilityCalculatorService.calculate({
      netSales: Money.fromMinor(netSalesMinor, currency),
      cogs: Money.fromMinor(cogsMinor, currency),
      operatingExpenses: Money.fromMinor(operatingExpensesMinor, currency),
    });

    // 5. Category breakdown
    const expensesByCategory = Array.from(categoryExpensesMap.entries())
      .map(([categoryNameAr, totalMinor]) => ({
        categoryNameAr,
        totalMinor,
        percent:
          operatingExpensesMinor > 0
            ? Math.round((totalMinor / operatingExpensesMinor) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.totalMinor - a.totalMinor);

    // 6. Daily breakdown sorted chronologically
    const dailyBreakdown: DailySalesAndCogs[] = Array.from(dailyMap.entries())
      .map(([date, d]) => ({
        date,
        salesMinor: d.sales,
        cogsMinor: d.cogs,
        expensesMinor: d.expenses,
        grossProfitMinor: d.sales - d.cogs - d.expenses,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      currency,
      currencySymbol,
      fromDate: params.fromDate.toISOString().slice(0, 10),
      toDate: params.toDate.toISOString().slice(0, 10),
      totalOrdersCount: orders.length,
      netSalesMinor: metrics.netSales.amount,
      cogsMinor: metrics.cogs.amount,
      operatingExpensesMinor: metrics.operatingExpenses.amount,
      grossProfitMinor: metrics.grossProfit.amount,
      operatingProfitMinor: metrics.operatingProfit.amount,
      cogsPercent: metrics.cogsPercent,
      grossMarginPercent: metrics.grossMarginPercent,
      operatingMarginPercent: metrics.operatingMarginPercent,
      expensesByCategory,
      dailyBreakdown,
    };
  }
}
