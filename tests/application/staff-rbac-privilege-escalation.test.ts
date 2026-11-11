import { describe, it, expect, vi } from 'vitest';
import { CreateStaffUseCase } from '../../src/application/staff/use-cases/create-staff.use-case';
import { UpdateStaffUseCase } from '../../src/application/staff/use-cases/update-staff.use-case';
import { ToggleStaffStatusUseCase } from '../../src/application/staff/use-cases/toggle-staff-status.use-case';
import { SystemRole } from '../../src/domain/staff/enums/role.enum';
import { ForbiddenError, ValidationError } from '../../src/domain/shared/errors/domain-error';
import { UserSessionContext } from '../../src/infrastructure/auth/branch-context.service';
import type { PrismaClient } from '@prisma/client';

const createManagerSession = (overrides: Partial<UserSessionContext> = {}): UserSessionContext => ({
  userId: 'manager-1',
  role: 'BRANCH_MANAGER',
  permissions: ['MANAGE_STAFF'],
  assignedBranchIds: ['branch-1'],
  isSuperAdmin: false,
  ...overrides,
});

const createSuperAdminSession = (overrides: Partial<UserSessionContext> = {}): UserSessionContext => ({
  userId: 'super-admin-1',
  role: SystemRole.SUPER_ADMIN,
  permissions: ['MANAGE_STAFF'],
  assignedBranchIds: [],
  isSuperAdmin: true,
  ...overrides,
});

describe('B3: Staff Privilege Escalation and Anti-Tampering', () => {
  describe('CreateStaffUseCase', () => {
    it('prevents non-SuperAdmin from creating a SUPER_ADMIN staff member', async () => {
      const superAdminRoleId = crypto.randomUUID();
      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        role: { findUnique: vi.fn().mockResolvedValue({ id: superAdminRoleId, name: SystemRole.SUPER_ADMIN }) },
      };

      const useCase = new CreateStaffUseCase(mockPrisma as unknown as PrismaClient);
      const managerSession = createManagerSession();

      await expect(
        useCase.execute(
          {
            username: 'hacker_admin',
            fullName: 'Hacker SuperAdmin',
            phone: '01012345678',
            password: 'SecurePassword123!',
            roleId: superAdminRoleId,
            branchIds: ['branch-1'],
          },
          managerSession
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('prevents staff manager from assigning branches outside their own branches', async () => {
      const cashierRoleId = crypto.randomUUID();
      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        role: { findUnique: vi.fn().mockResolvedValue({ id: cashierRoleId, name: SystemRole.CASHIER }) },
      };

      const useCase = new CreateStaffUseCase(mockPrisma as unknown as PrismaClient);
      const managerSession = createManagerSession({ assignedBranchIds: ['branch-1'] });

      await expect(
        useCase.execute(
          {
            username: 'cashier_b2',
            fullName: 'Cashier Branch 2',
            phone: '01012345678',
            password: 'SecurePassword123!',
            roleId: cashierRoleId,
            branchIds: ['branch-2'], // Not in manager's assigned branches
          },
          managerSession
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('UpdateStaffUseCase & Demotion Protection', () => {
    it('prevents demoting the last active SUPER_ADMIN', async () => {
      const superAdminUserId = crypto.randomUUID();
      const cashierRoleId = crypto.randomUUID();

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: superAdminUserId,
            role: { name: SystemRole.SUPER_ADMIN },
            userBranches: [],
          }),
          count: vi.fn().mockResolvedValue(1), // Only 1 active super admin
        },
        role: {
          findUnique: vi.fn().mockResolvedValue({ id: cashierRoleId, name: SystemRole.CASHIER }),
        },
      };

      const useCase = new UpdateStaffUseCase(mockPrisma as unknown as PrismaClient);
      const superAdminSession = createSuperAdminSession({ userId: superAdminUserId });

      await expect(
        useCase.execute(
          {
            userId: superAdminUserId,
            fullName: 'Owner',
            phone: '01012345678',
            roleId: cashierRoleId, // Attempting to demote last super admin
            branchIds: [],
          },
          superAdminSession
        )
      ).rejects.toThrow(ValidationError);
    });

    it('prevents a non-SuperAdmin manager from updating a SUPER_ADMIN account', async () => {
      const targetAdminId = crypto.randomUUID();
      const targetRoleId = crypto.randomUUID();

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: targetAdminId,
            role: { name: SystemRole.SUPER_ADMIN },
            userBranches: [],
          }),
        },
        role: {
          findUnique: vi.fn().mockResolvedValue({ id: targetRoleId, name: SystemRole.SUPER_ADMIN }),
        },
      };

      const useCase = new UpdateStaffUseCase(mockPrisma as unknown as PrismaClient);
      const managerSession = createManagerSession();

      await expect(
        useCase.execute(
          {
            userId: targetAdminId,
            fullName: 'Target Admin Modified',
            phone: '01012345678',
            roleId: targetRoleId,
            branchIds: [],
          },
          managerSession
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('ToggleStaffStatusUseCase & Deactivation Guard', () => {
    it('prevents deactivating the last active SUPER_ADMIN', async () => {
      const adminId = crypto.randomUUID();
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: adminId,
            role: { name: SystemRole.SUPER_ADMIN },
            isActive: true,
          }),
          count: vi.fn().mockResolvedValue(1), // Last one
        },
      };

      const useCase = new ToggleStaffStatusUseCase(mockPrisma as unknown as PrismaClient);
      const superAdminSession = createSuperAdminSession({ userId: crypto.randomUUID() });

      await expect(
        useCase.execute(adminId, false, superAdminSession)
      ).rejects.toThrow(ValidationError);
    });
  });
});
