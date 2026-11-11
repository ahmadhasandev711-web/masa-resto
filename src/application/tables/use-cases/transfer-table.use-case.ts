import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { NotFoundError, ValidationError } from '../../../domain/shared/errors/domain-error';
import { TableStatus } from '../../../domain/tables/enums';
import { TransferTableDto, transferTableSchema } from '../dto/table.dto';

export class TransferTableUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: TransferTableDto) {
    const validated = transferTableSchema.parse(input);

    if (validated.fromTableId === validated.toTableId) {
      throw new ValidationError('لا يمكن نقل الطلب إلى نفس الطاولة الحالية');
    }

    return this.db.$transaction(async (tx) => {
      // 1. Deadlock-free locking: Sort IDs lexicographically to guarantee consistent locking order
      const [firstId, secondId] = [validated.fromTableId, validated.toTableId].sort();

      await tx.$queryRaw(
        Prisma.sql`SELECT id, status, active_order_id, branch_id FROM dining_tables WHERE id IN (${firstId}, ${secondId}) ORDER BY id FOR UPDATE`
      );

      const [fromTable, toTable] = await Promise.all([
        tx.diningTable.findUnique({ where: { id: validated.fromTableId } }),
        tx.diningTable.findUnique({ where: { id: validated.toTableId } }),
      ]);

      if (!fromTable || !fromTable.isActive) {
        throw new NotFoundError('طاولة المصدر', validated.fromTableId);
      }

      if (!toTable || !toTable.isActive) {
        throw new NotFoundError('طاولة الوجهة', validated.toTableId);
      }

      if (fromTable.branchId !== toTable.branchId) {
        throw new ValidationError('لا يمكن نقل الطاولات عبر فروع مختلفة');
      }

      if (!fromTable.activeOrderId) {
        throw new ValidationError(`الطاولة ${fromTable.tableNumber} لا تحتوي على أي طلب مفتوح لنقله`);
      }

      if (toTable.status !== TableStatus.AVAILABLE || toTable.activeOrderId !== null) {
        throw new ValidationError(`الطاولة المستهدفة ${toTable.tableNumber} مشغولة بالفعل أو غير متاحة`);
      }

      // 2. Update Order's table pointer
      const updatedOrder = await tx.order.update({
        where: { id: fromTable.activeOrderId! },
        data: {
          tableId: toTable.id,
          tableName: toTable.tableNumber,
        },
      });

      // 3. Free source table
      const freedFromTable = await tx.diningTable.update({
        where: { id: fromTable.id },
        data: {
          status: TableStatus.AVAILABLE,
          activeOrderId: null,
        },
      });

      // 4. Occupy destination table atomically (OCCUPIED or BILL_PRINTED)
      const updateToResult = await tx.diningTable.updateMany({
        where: { id: toTable.id, status: TableStatus.AVAILABLE, activeOrderId: null },
        data: {
          status: fromTable.status,
          activeOrderId: updatedOrder.id,
        },
      });

      if (updateToResult.count === 0) {
        throw new ValidationError(`الطاولة المستهدفة ${toTable.tableNumber} تم شغلها من محطة أخرى`);
      }

      const occupiedToTable = await tx.diningTable.findUniqueOrThrow({
        where: { id: toTable.id },
      });

      return {
        order: {
          ...updatedOrder,
          taxRatePercent: Number(updatedOrder.taxRatePercent),
        },
        fromTable: freedFromTable,
        toTable: occupiedToTable,
      };
    });
  }
}
