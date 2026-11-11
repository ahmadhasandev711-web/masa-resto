import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../domain/shared/errors/domain-error';
import { TableStatus } from '../../../domain/tables/enums';
import { OrderStatus, PaymentStatus } from '../../../domain/ordering/enums';
import { InventoryMovementType } from '../../../domain/inventory/enums';
import { OrderInventoryDeductionService, PrismaTransactionClient } from '../../../infrastructure/inventory/order-inventory-deduction.service';
import { CloseTableTabDto, closeTableTabSchema } from '../dto/table.dto';

export class CloseTableTabUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async execute(input: CloseTableTabDto) {
    const validated = closeTableTabSchema.parse(input);

    const [table, order, shift] = await Promise.all([
      this.db.diningTable.findUnique({ where: { id: validated.tableId } }),
      this.db.order.findUnique({ where: { id: validated.orderId } }),
      this.db.cashShift.findUnique({ where: { id: validated.cashShiftId } }),
    ]);

    if (!table || !table.isActive) {
      throw new NotFoundError('الطاولة', validated.tableId);
    }

    if (!order || !order.isTabOpen) {
      throw new ValidationError('الطلب المفتوح غير موجود أو مغلق بالفعل');
    }

    if (table.activeOrderId !== order.id) {
      throw new ValidationError('الطلب لا ينتمي لهذه الطاولة');
    }

    if (!shift || shift.status !== 'OPEN') {
      throw new ValidationError('وردية الكاشير غير مفتوحة لاستلام المدفوعات');
    }

    if (validated.cashierId && shift.cashierId !== validated.cashierId) {
      throw new ForbiddenError('لا يمكن تحصيل الفاتورة على وردية كاشير آخر');
    }

    if (shift.branchId !== table.branchId) {
      throw new ValidationError('الوردية لا تتبع نفس فرع الطاولة');
    }

    // 1. Verify payments coverage
    const orderTotal = order.totalMinor;

    const resolvedPayments = validated.payments && validated.payments.length > 0
      ? validated.payments
      : [{ method: validated.paymentMethod, amountMinor: orderTotal }];

    const totalPaid = resolvedPayments.reduce((sum, p) => sum + p.amountMinor, 0);

    if (totalPaid !== orderTotal) {
      throw new ValidationError(
        `إجمالي المدفوعات (${(totalPaid / 100).toFixed(2)}) لا يطابق إجمالي الفاتورة المطلوب (${(orderTotal / 100).toFixed(2)})`
      );
    }

    // 2. Atomic Settle Transaction (GR-4.1)
    return this.db.$transaction(async (tx) => {
      // Lock shift to prevent races
      if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw(
          Prisma.sql`SELECT id, status, cashier_id, branch_id FROM cash_shifts WHERE id = ${validated.cashShiftId} FOR UPDATE`
        );
      }
      // Record Payments
      for (const p of resolvedPayments) {
        await tx.orderPayment.create({
          data: {
            orderId: order.id,
            method: p.method,
            amountMinor: p.amountMinor,
          },
        });
      }

      // Complete Order & Close Tab
      const completedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: validated.paymentMethod,
          isTabOpen: false,
        },
      });

      // Free the Table to AVAILABLE
      const freedTable = await tx.diningTable.update({
        where: { id: table.id },
        data: {
          status: TableStatus.AVAILABLE,
          activeOrderId: null,
        },
      });

      // Deduct inventory BOM atomically
      await OrderInventoryDeductionService.deductForOrder(
        order.id,
        tx as unknown as PrismaTransactionClient,
        InventoryMovementType.SALE_POS,
        validated.cashierId
      );

      return {
        order: {
          ...completedOrder,
          taxRatePercent: Number(completedOrder.taxRatePercent),
        },
        table: freedTable,
      };
    });
  }
}
