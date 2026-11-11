'use server';

import { SessionService } from '../../infrastructure/auth/session.service';
import { BranchContextService } from '../../infrastructure/auth/branch-context.service';
import { prisma } from '../../infrastructure/db/prisma';
import { NotFoundError } from '../../domain/shared/errors/domain-error';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { ActionResult, toActionFailure } from './action-result';
import { assertDemoAllows } from '../../infrastructure/demo/demo-policy';
import {
  CreateTableSectionDto,
  UpdateTableSectionDto,
  CreateTableDto,
  UpdateTableDto,
  OpenTableTabDto,
  AddItemsToTabDto,
  TransferTableDto,
  PrintTableBillDto,
  CloseTableTabDto,
  SplitBillEqualDto,
  splitBillEqualSchema,
} from '../../application/tables/dto/table.dto';
import { ListTablesUseCase } from '../../application/tables/use-cases/list-tables.use-case';
import { ManageSectionsUseCase } from '../../application/tables/use-cases/manage-sections.use-case';
import { ManageTablesUseCase } from '../../application/tables/use-cases/manage-tables.use-case';
import { OpenTableTabUseCase } from '../../application/tables/use-cases/open-table-tab.use-case';
import { AddItemsToTabUseCase } from '../../application/tables/use-cases/add-items-to-tab.use-case';
import { TransferTableUseCase } from '../../application/tables/use-cases/transfer-table.use-case';
import { PrintTableBillUseCase } from '../../application/tables/use-cases/print-table-bill.use-case';
import { CloseTableTabUseCase } from '../../application/tables/use-cases/close-table-tab.use-case';
import { SplitBillService } from '../../domain/tables/services/split-bill.service';
import { Money } from '../../domain/shared/value-objects/money';

// 1. List Tables
export async function listTablesAction(branchId: string): Promise<ActionResult<Awaited<ReturnType<ListTablesUseCase['execute']>>>> {
  try {
    const session = await SessionService.getCurrent();
    if (!session) {
      return toActionFailure(new Error('يرجى تسجيل الدخول'));
    }
    const hasAccess =
      session.isSuperAdmin ||
      session.permissions.includes(PermissionCode.POS_ACCESS) ||
      session.permissions.includes(PermissionCode.MANAGE_BRANCHES);
    if (!hasAccess) {
      return toActionFailure(new Error('لا تملك صلاحية استعراض الصالة والطاولات'));
    }
    await BranchContextService.assertBranchAccess(session, branchId);
    const result = await new ListTablesUseCase().execute(branchId);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

// 2. Manage Sections
export async function createTableSectionAction(dto: CreateTableSectionDto): Promise<ActionResult<Awaited<ReturnType<ManageSectionsUseCase['create']>>>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    await BranchContextService.assertBranchAccess(session, dto.branchId);
    const result = await new ManageSectionsUseCase().create(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateTableSectionAction(dto: UpdateTableSectionDto): Promise<ActionResult<Awaited<ReturnType<ManageSectionsUseCase['update']>>>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const result = await new ManageSectionsUseCase().update(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function deleteTableSectionAction(id: string): Promise<ActionResult<Awaited<ReturnType<ManageSectionsUseCase['delete']>>>> {
  try {
    assertDemoAllows('delete');
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const result = await new ManageSectionsUseCase().delete(id);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

// 3. Manage Tables
export async function createTableAction(dto: CreateTableDto): Promise<ActionResult<Awaited<ReturnType<ManageTablesUseCase['create']>>>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    await BranchContextService.assertBranchAccess(session, dto.branchId);
    const result = await new ManageTablesUseCase().create(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateTableAction(dto: UpdateTableDto): Promise<ActionResult<Awaited<ReturnType<ManageTablesUseCase['update']>>>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const result = await new ManageTablesUseCase().update(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function deleteTableAction(id: string): Promise<ActionResult<Awaited<ReturnType<ManageTablesUseCase['delete']>>>> {
  try {
    assertDemoAllows('delete');
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const result = await new ManageTablesUseCase().delete(id);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

// 4. Tab Operations (POS Access)
export async function openTableTabAction(dto: OpenTableTabDto): Promise<ActionResult<Awaited<ReturnType<OpenTableTabUseCase['execute']>>>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.POS_ACCESS);
    await BranchContextService.assertBranchAccess(session, dto.branchId);
    const result = await new OpenTableTabUseCase().execute({
      ...dto,
      cashierId: session.userId,
    });
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function addItemsToTabAction(dto: AddItemsToTabDto): Promise<ActionResult<Awaited<ReturnType<AddItemsToTabUseCase['execute']>>>> {
  try {
    await SessionService.requirePermission(PermissionCode.POS_ACCESS);
    const result = await new AddItemsToTabUseCase().execute(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function transferTableAction(dto: TransferTableDto): Promise<ActionResult<Awaited<ReturnType<TransferTableUseCase['execute']>>>> {
  try {
    await SessionService.requirePermission(PermissionCode.POS_ACCESS);
    const result = await new TransferTableUseCase().execute(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function printTableBillAction(dto: PrintTableBillDto): Promise<ActionResult<Awaited<ReturnType<PrintTableBillUseCase['execute']>>>> {
  try {
    await SessionService.requirePermission(PermissionCode.POS_ACCESS);
    const result = await new PrintTableBillUseCase().execute(dto);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function splitBillEqualAction(dto: SplitBillEqualDto): Promise<ActionResult<{ totalMinor: number; splits: Array<{ partIndex: number; amountMinor: number }> }>> {
  try {
    await SessionService.requirePermission(PermissionCode.POS_ACCESS);
    const validated = splitBillEqualSchema.parse(dto);

    const order = await prisma.order.findUnique({ where: { id: validated.orderId } });
    if (!order) {
      throw new NotFoundError('الطلب', validated.orderId);
    }

    const total = Money.fromMinor(order.totalMinor, order.currency ?? 'EGP');
    const splits = SplitBillService.splitEqually(total, validated.splitCount);

    return {
      success: true,
      data: {
        totalMinor: order.totalMinor,
        splits: splits.map((part, index) => ({
          partIndex: index + 1,
          amountMinor: part.amount,
        })),
      },
    };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function closeTableTabAction(dto: CloseTableTabDto): Promise<ActionResult<Awaited<ReturnType<CloseTableTabUseCase['execute']>>>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.POS_ACCESS);
    const result = await new CloseTableTabUseCase().execute({
      ...dto,
      cashierId: session.userId,
    });
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}
