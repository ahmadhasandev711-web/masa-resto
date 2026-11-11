import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../domain/shared/errors/domain-error';
import { TableStatus } from '../../../domain/tables/enums';
import { TableStateMachine } from '../../../domain/tables/services/table-state-machine';
import {
  CreateTableDto,
  createTableSchema,
  UpdateTableDto,
  updateTableSchema,
} from '../dto/table.dto';

export class ManageTablesUseCase {
  public async create(dto: CreateTableDto) {
    const validated = createTableSchema.parse(dto);

    // Verify unique table number per branch
    const existing = await prisma.diningTable.findUnique({
      where: {
        branchId_tableNumber: {
          branchId: validated.branchId,
          tableNumber: validated.tableNumber.trim(),
        },
      },
    });

    if (existing) {
      throw new ValidationError(`رقم الطاولة "${validated.tableNumber}" مسجل بالفعل في هذا الفرع`);
    }

    return prisma.diningTable.create({
      data: {
        branchId: validated.branchId,
        sectionId: validated.sectionId || null,
        tableNumber: validated.tableNumber.trim(),
        capacity: validated.capacity,
        shape: validated.shape,
        sortOrder: validated.sortOrder,
        status: TableStatus.AVAILABLE,
      },
    });
  }

  public async update(dto: UpdateTableDto) {
    const validated = updateTableSchema.parse(dto);

    const existing = await prisma.diningTable.findUnique({ where: { id: validated.id } });
    if (!existing) {
      throw new NotFoundError('الطاولة', validated.id);
    }

    // If changing tableNumber, check uniqueness
    if (validated.tableNumber && validated.tableNumber.trim() !== existing.tableNumber) {
      const duplicate = await prisma.diningTable.findUnique({
        where: {
          branchId_tableNumber: {
            branchId: existing.branchId,
            tableNumber: validated.tableNumber.trim(),
          },
        },
      });
      if (duplicate && duplicate.id !== existing.id) {
        throw new ValidationError(`رقم الطاولة "${validated.tableNumber}" مسجل بالفعل في هذا الفرع`);
      }
    }

    return prisma.diningTable.update({
      where: { id: validated.id },
      data: {
        sectionId: validated.sectionId !== undefined ? validated.sectionId : existing.sectionId,
        tableNumber: validated.tableNumber?.trim(),
        capacity: validated.capacity,
        shape: validated.shape,
        status: validated.status,
        sortOrder: validated.sortOrder,
        isActive: validated.isActive,
      },
    });
  }

  public async delete(id: string) {
    const existing = await prisma.diningTable.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('الطاولة', id);
    }

    if (existing.status !== TableStatus.AVAILABLE && existing.status !== TableStatus.CLEANING) {
      throw new ValidationError('لا يمكن حذف الطاولة أثناء انشغالها بطلب أو انتظار التحصيل');
    }

    return prisma.diningTable.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
