'use server';

import { SessionService } from '../../infrastructure/auth/session.service';
import { BranchContextService } from '../../infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { ActionResult, toActionFailure } from './action-result';
import { ForbiddenError } from '../../domain/shared/errors/domain-error';
import {
  GetSalesAnalyticsUseCase,
  SalesAnalyticsResult,
} from '../../application/reports/use-cases/get-sales-analytics.use-case';
import {
  GetMenuEngineeringUseCase,
  MenuEngineeringResult,
} from '../../application/reports/use-cases/get-menu-engineering.use-case';
import {
  GetBranchPerformanceUseCase,
  BranchPerformanceResult,
} from '../../application/reports/use-cases/get-branch-performance.use-case';
import {
  GetInventoryAnalyticsUseCase,
  InventoryAnalyticsResult,
} from '../../application/reports/use-cases/get-inventory-analytics.use-case';

export async function getSalesAnalyticsAction(input: {
  branchId?: string;
  startDateIso: string;
  endDateIso: string;
}): Promise<ActionResult<SalesAnalyticsResult>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.VIEW_REPORTS);
    const scope = BranchContextService.resolveScope(session);

    let targetBranchId = input.branchId;
    if (scope.allowedBranchIds !== 'ALL') {
      targetBranchId = await BranchContextService.assertBranchAccess(session, input.branchId);
    } else if (input.branchId) {
      await BranchContextService.assertBranchAccess(session, input.branchId);
    }

    const useCase = new GetSalesAnalyticsUseCase();
    const data = await useCase.execute({
      branchId: targetBranchId,
      startDate: new Date(input.startDateIso),
      endDate: new Date(input.endDateIso),
    });

    return { success: true, data };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getMenuEngineeringAction(input: {
  branchId?: string;
  startDateIso: string;
  endDateIso: string;
}): Promise<ActionResult<MenuEngineeringResult>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.VIEW_REPORTS);
    const scope = BranchContextService.resolveScope(session);

    let targetBranchId = input.branchId;
    if (scope.allowedBranchIds !== 'ALL') {
      targetBranchId = await BranchContextService.assertBranchAccess(session, input.branchId);
    } else if (input.branchId) {
      await BranchContextService.assertBranchAccess(session, input.branchId);
    }

    const useCase = new GetMenuEngineeringUseCase();
    const data = await useCase.execute({
      branchId: targetBranchId,
      startDate: new Date(input.startDateIso),
      endDate: new Date(input.endDateIso),
    });

    return { success: true, data };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getBranchPerformanceAction(input: {
  startDateIso: string;
  endDateIso: string;
}): Promise<ActionResult<BranchPerformanceResult>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.VIEW_REPORTS);
    const scope = BranchContextService.resolveScope(session);
    if (scope.allowedBranchIds !== 'ALL') {
      throw new ForbiddenError('تقرير مقارنة أداء الفروع متاح فقط للإدارة المركزية');
    }

    const useCase = new GetBranchPerformanceUseCase();
    const data = await useCase.execute({
      startDate: new Date(input.startDateIso),
      endDate: new Date(input.endDateIso),
    });

    return { success: true, data };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getInventoryAnalyticsAction(input: {
  branchId?: string;
  startDateIso: string;
  endDateIso: string;
}): Promise<ActionResult<InventoryAnalyticsResult>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.VIEW_REPORTS);
    const scope = BranchContextService.resolveScope(session);

    let targetBranchId = input.branchId;
    if (scope.allowedBranchIds !== 'ALL') {
      targetBranchId = await BranchContextService.assertBranchAccess(session, input.branchId);
    } else if (input.branchId) {
      await BranchContextService.assertBranchAccess(session, input.branchId);
    }

    const useCase = new GetInventoryAnalyticsUseCase();
    const data = await useCase.execute({
      branchId: targetBranchId,
      startDate: new Date(input.startDateIso),
      endDate: new Date(input.endDateIso),
    });

    return { success: true, data };
  } catch (error) {
    return toActionFailure(error);
  }
}
