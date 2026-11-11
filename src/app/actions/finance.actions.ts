'use server';

import { revalidatePath } from 'next/cache';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { SessionService } from '../../infrastructure/auth/session.service';
import { BranchContextService } from '../../infrastructure/auth/branch-context.service';
import { prisma } from '../../infrastructure/db/prisma';
import { PrismaFinanceRepository } from '../../infrastructure/finance/prisma-finance.repository';
import {
  RecordCashMovementDto,
  BlindCloseCashShiftDto,
  AuditShiftDto,
  CreateExpenseDto,
} from '../../application/finance/dto/finance.dto';
import { RecordCashMovementUseCase } from '../../application/finance/use-cases/record-cash-movement.use-case';
import { BlindCloseCashShiftUseCase } from '../../application/finance/use-cases/blind-close-cash-shift.use-case';
import { AuditCashShiftUseCase } from '../../application/finance/use-cases/audit-cash-shift.use-case';
import { CreateExpenseUseCase } from '../../application/finance/use-cases/create-expense.use-case';
import { GetCashShiftDetailsUseCase } from '../../application/finance/use-cases/get-cash-shift-details.use-case';
import { ActionResult, toActionFailure } from './action-result';
import { ForbiddenError } from '../../domain/shared/errors/domain-error';
import {
  ShiftMovementRecord,
  CashShiftDetail,
  ExpenseListItem,
} from '../../domain/finance/contracts/finance.repository';

const financeRepo = new PrismaFinanceRepository();

export async function recordCashMovementAction(
  dto: RecordCashMovementDto
): Promise<ActionResult<ShiftMovementRecord>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_FINANCE);
    await BranchContextService.assertBranchAccess(session, dto.branchId);

    const useCase = new RecordCashMovementUseCase(financeRepo);
    const result = await useCase.execute(dto, session.userId);

    revalidatePath('/admin/finance');
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function blindCloseCashShiftAction(
  dto: BlindCloseCashShiftDto
): Promise<ActionResult<CashShiftDetail>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_FINANCE);
    await BranchContextService.assertBranchAccess(session, dto.branchId);

    const useCase = new BlindCloseCashShiftUseCase(financeRepo);
    const result = await useCase.execute(dto, session.userId);

    revalidatePath('/admin/finance');
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function auditCashShiftAction(
  dto: AuditShiftDto
): Promise<ActionResult<CashShiftDetail>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_FINANCE);
    await BranchContextService.assertBranchAccess(session, dto.branchId);

    const useCase = new AuditCashShiftUseCase(financeRepo);
    const result = await useCase.execute(dto, session.userId);

    revalidatePath('/admin/finance');
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function createExpenseAction(
  dto: CreateExpenseDto
): Promise<ActionResult<ExpenseListItem>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_FINANCE);
    await BranchContextService.assertBranchAccess(session, dto.branchId);

    const settings = await prisma.restaurantSetting.findFirst();
    const currency = settings?.currency ?? 'EGP';

    const useCase = new CreateExpenseUseCase(financeRepo);
    const result = await useCase.execute(dto, session.userId, currency, session.userId);

    revalidatePath('/admin/finance');
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getShiftDetailsAction(
  shiftId: string,
  branchId?: string
): Promise<ActionResult<CashShiftDetail | null>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_FINANCE);
    const scope = BranchContextService.resolveScope(session);

    let targetBranchId = branchId;
    if (scope.allowedBranchIds !== 'ALL') {
      targetBranchId = await BranchContextService.assertBranchAccess(session, branchId);
    } else if (branchId) {
      await BranchContextService.assertBranchAccess(session, branchId);
    }

    const useCase = new GetCashShiftDetailsUseCase(financeRepo);
    const result = await useCase.execute(shiftId, targetBranchId);

    if (result && scope.allowedBranchIds !== 'ALL' && !scope.allowedBranchIds.includes(result.branchId)) {
      throw new ForbiddenError('غير مصرح لك باستعراض وردية تابعة لفرع آخر');
    }

    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}
