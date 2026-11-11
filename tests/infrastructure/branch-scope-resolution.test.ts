import { describe, it, expect, vi } from 'vitest';
import {
  BranchContextService,
  UserSessionContext,
  ScopedDbClient,
} from '../../src/infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../src/domain/staff/enums/permission.enum';
import { ForbiddenError, NotFoundError } from '../../src/domain/shared/errors/domain-error';

const createSession = (overrides: Partial<UserSessionContext> = {}): UserSessionContext => ({
  userId: 'user-1',
  role: 'BRANCH_MANAGER',
  permissions: [PermissionCode.MANAGE_BRANCHES, PermissionCode.MANAGE_ORDERS],
  assignedBranchIds: ['branch-1', 'branch-2'],
  isSuperAdmin: false,
  ...overrides,
});

describe('B1: BranchContextService Unified Scope Resolution', () => {
  describe('resolveScope', () => {
    it('returns "ALL" exclusively for SuperAdmin', () => {
      const superAdminSession = createSession({
        isSuperAdmin: true,
        assignedBranchIds: [],
      });
      const scope = BranchContextService.resolveScope(superAdminSession);
      expect(scope.allowedBranchIds).toBe('ALL');
    });

    it('returns strictly assigned branches for non-superadmin even if they have MANAGE_BRANCHES', () => {
      const managerSession = createSession({
        isSuperAdmin: false,
        permissions: [PermissionCode.MANAGE_BRANCHES, PermissionCode.MANAGE_ORDERS],
        assignedBranchIds: ['branch-1', 'branch-2'],
      });
      const scope = BranchContextService.resolveScope(managerSession);
      expect(scope.allowedBranchIds).toEqual(['branch-1', 'branch-2']);
      expect(scope.allowedBranchIds).not.toBe('ALL');
    });

    it('returns empty array when user is assigned to no branches', () => {
      const noBranchSession = createSession({
        isSuperAdmin: false,
        assignedBranchIds: [],
      });
      const scope = BranchContextService.resolveScope(noBranchSession);
      expect(scope.allowedBranchIds).toEqual([]);
    });
  });

  describe('assertOrderInScope', () => {
    it('allows SuperAdmin to access order in any branch', async () => {
      const superAdmin = createSession({ isSuperAdmin: true, assignedBranchIds: [] });
      const mockPrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue({ id: 'order-1', branchId: 'branch-foreign' }),
        },
      };

      const result = await BranchContextService.assertOrderInScope(superAdmin, 'order-1', mockPrisma as unknown as ScopedDbClient);
      expect(result).toBe('branch-foreign');
    });

    it('allows staff to access order in their assigned branch', async () => {
      const staff = createSession({ assignedBranchIds: ['branch-1'] });
      const mockPrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue({ id: 'order-1', branchId: 'branch-1' }),
        },
      };

      const result = await BranchContextService.assertOrderInScope(staff, 'order-1', mockPrisma as any);
      expect(result).toBe('branch-1');
    });

    it('throws ForbiddenError when staff tries to access order in another branch', async () => {
      const staff = createSession({ assignedBranchIds: ['branch-1'] });
      const mockPrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue({ id: 'order-2', branchId: 'branch-2' }),
        },
      };

      await expect(
        BranchContextService.assertOrderInScope(staff, 'order-2', mockPrisma as any)
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when order does not exist', async () => {
      const staff = createSession();
      const mockPrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(
        BranchContextService.assertOrderInScope(staff, 'order-unknown', mockPrisma as any)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('assertTableInScope', () => {
    it('allows staff to access table in assigned branch', async () => {
      const staff = createSession({ assignedBranchIds: ['branch-1'] });
      const mockPrisma = {
        diningTable: {
          findUnique: vi.fn().mockResolvedValue({ id: 'tbl-1', branchId: 'branch-1' }),
        },
      };

      const result = await BranchContextService.assertTableInScope(staff, 'tbl-1', mockPrisma as any);
      expect(result).toBe('branch-1');
    });

    it('throws ForbiddenError when table belongs to another branch', async () => {
      const staff = createSession({ assignedBranchIds: ['branch-1'] });
      const mockPrisma = {
        diningTable: {
          findUnique: vi.fn().mockResolvedValue({ id: 'tbl-2', branchId: 'branch-2' }),
        },
      };

      await expect(
        BranchContextService.assertTableInScope(staff, 'tbl-2', mockPrisma as any)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('assertShiftOwnedBy', () => {
    it('verifies shift branch and returns shift details', async () => {
      const staff = createSession({ assignedBranchIds: ['branch-1'] });
      const mockShift = { id: 'shift-1', branchId: 'branch-1', cashierId: 'user-1', status: 'OPEN' };
      const mockPrisma = {
        cashShift: {
          findUnique: vi.fn().mockResolvedValue(mockShift),
        },
      };

      const result = await BranchContextService.assertShiftOwnedBy(staff, 'shift-1', 'branch-1', mockPrisma as any);
      expect(result).toEqual(mockShift);
    });

    it('throws ForbiddenError if shift belongs to a branch user is not assigned to', async () => {
      const staff = createSession({ assignedBranchIds: ['branch-1'] });
      const mockShift = { id: 'shift-2', branchId: 'branch-2', cashierId: 'user-2', status: 'OPEN' };
      const mockPrisma = {
        cashShift: {
          findUnique: vi.fn().mockResolvedValue(mockShift),
        },
      };

      await expect(
        BranchContextService.assertShiftOwnedBy(staff, 'shift-2', undefined, mockPrisma as any)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
