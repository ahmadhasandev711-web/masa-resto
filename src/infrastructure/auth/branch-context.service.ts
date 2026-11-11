import { ForbiddenError, NotFoundError } from '../../domain/shared/errors/domain-error';
import { prisma } from '../db/prisma';
import type { PrismaClient } from '@prisma/client';

export interface UserSessionContext {
  userId: string;
  role: string;
  permissions: string[];
  assignedBranchIds: string[];
  isSuperAdmin: boolean;
}

/** allowedBranchIds === null means unrestricted (super admin). */
export interface BranchScope {
  allowedBranchIds: string[] | null;
}

export interface ResolvedBranchScope {
  allowedBranchIds: string[] | 'ALL';
}

export type ScopedDbClient = {
  order: Pick<PrismaClient['order'], 'findUnique'>;
  diningTable: Pick<PrismaClient['diningTable'], 'findUnique'>;
  cashShift: Pick<PrismaClient['cashShift'], 'findUnique'>;
  branch: Pick<PrismaClient['branch'], 'findFirst' | 'findUnique'>;
};

export class BranchContextService {
  /**
   * Resolves the caller's authorized branch scope.
   * Returns 'ALL' exclusively for SuperAdmin. All other roles get their assignedBranchIds.
   */
  public static resolveScope(session: UserSessionContext): ResolvedBranchScope {
    return {
      allowedBranchIds: session.isSuperAdmin ? 'ALL' : session.assignedBranchIds,
    };
  }

  public static scopeOf(session: UserSessionContext): BranchScope {
    return { allowedBranchIds: session.isSuperAdmin ? null : session.assignedBranchIds };
  }

  /**
   * Rejects access to a resource owned by a branch outside the caller's scope.
   * Resources not yet assigned to any branch (null) are visible to all scopes.
   */
  public static assertResourceInScope(scope: BranchScope, resourceBranchId: string | null): void {
    if (!resourceBranchId || scope.allowedBranchIds === null) return;
    if (!scope.allowedBranchIds.includes(resourceBranchId)) {
      throw new ForbiddenError('You do not have access to resources of this branch');
    }
  }

  /**
   * Asserts that an order belongs to a branch within the caller's scope.
   * Returns the order's branchId (or null if unassigned online order).
   */
  public static async assertOrderInScope(
    session: UserSessionContext,
    orderId: string,
    db: ScopedDbClient = prisma
  ): Promise<string | null> {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true },
    });

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    if (session.isSuperAdmin) {
      return order.branchId;
    }

    if (order.branchId && !session.assignedBranchIds.includes(order.branchId)) {
      throw new ForbiddenError('غير مصرح لك بالوصول لطلب تابع لفرع آخر');
    }

    return order.branchId;
  }

  /**
   * Asserts that a dining table belongs to a branch within the caller's scope.
   * Returns the table's branchId.
   */
  public static async assertTableInScope(
    session: UserSessionContext,
    tableId: string,
    db: ScopedDbClient = prisma
  ): Promise<string> {
    const table = await db.diningTable.findUnique({
      where: { id: tableId },
      select: { id: true, branchId: true },
    });

    if (!table) {
      throw new NotFoundError('DiningTable', tableId);
    }

    if (session.isSuperAdmin) {
      return table.branchId;
    }

    if (!session.assignedBranchIds.includes(table.branchId)) {
      throw new ForbiddenError('غير مصرح لك بالوصول لطاولة تابعة لفرع آخر');
    }

    return table.branchId;
  }

  /**
   * Asserts that a cash shift belongs to a branch within the caller's scope,
   * matches the expected branch if supplied, and returns the shift record.
   */
  public static async assertShiftOwnedBy(
    session: UserSessionContext,
    shiftId: string,
    expectedBranchId?: string,
    db: ScopedDbClient = prisma
  ): Promise<{ id: string; branchId: string; cashierId: string; status: string }> {
    const shift = await db.cashShift.findUnique({
      where: { id: shiftId },
      select: { id: true, branchId: true, cashierId: true, status: true },
    });

    if (!shift) {
      throw new NotFoundError('CashShift', shiftId);
    }

    if (expectedBranchId && shift.branchId !== expectedBranchId) {
      throw new ForbiddenError('الوردية لا تتبع الفرع المحدد');
    }

    if (!session.isSuperAdmin && !session.assignedBranchIds.includes(shift.branchId)) {
      throw new ForbiddenError('غير مصرح لك بالوصول لوردية تابعة لفرع آخر');
    }

    return shift;
  }

  /**
   * Resolves and verifies the active branch for an operation.
   * Ensures the user has explicit permission to operate within this branch.
   */
  public static async assertBranchAccess(
    session: UserSessionContext,
    requestedBranchId?: string | null,
    db: ScopedDbClient = prisma
  ): Promise<string> {
    // If no branch requested, try default branch
    let targetBranchId = requestedBranchId;

    if (!targetBranchId) {
      if (session.isSuperAdmin) {
        // Super admin can select first active branch or default
        const defaultBranch = await db.branch.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        });
        if (!defaultBranch) {
          throw new NotFoundError('No active branches exist in the restaurant');
        }
        return defaultBranch.id;
      }

      if (session.assignedBranchIds.length === 0) {
        throw new ForbiddenError('User is not assigned to any branch');
      }

      // Check among user's assigned branches for the first active one
      const userActiveBranch = await db.branch.findFirst({
        where: {
          id: { in: session.assignedBranchIds },
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!userActiveBranch) {
        throw new ForbiddenError('جميع الفروع المعينة للمستخدم غير مفعلة حالياً');
      }

      targetBranchId = userActiveBranch.id;
    }

    // Verify branch exists and is active
    const branch = await db.branch.findUnique({
      where: { id: targetBranchId },
    });

    if (!branch) {
      throw new NotFoundError('Branch', targetBranchId ?? undefined);
    }

    if (!branch.isActive) {
      throw new ForbiddenError(`Branch '${branch.nameAr}' is currently inactive`);
    }

    // If super admin, has global branch access
    if (session.isSuperAdmin) {
      return branch.id;
    }

    // Check if user is assigned to this branch
    if (!session.assignedBranchIds.includes(branch.id)) {
      throw new ForbiddenError(`User does not have access to branch '${branch.nameAr}'`);
    }

    return branch.id;
  }
}
