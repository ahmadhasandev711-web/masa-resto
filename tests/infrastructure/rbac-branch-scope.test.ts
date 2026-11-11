import { describe, it, expect } from 'vitest';
import { RbacGuard } from '../../src/infrastructure/auth/rbac-guard';
import { BranchContextService, UserSessionContext } from '../../src/infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../src/domain/staff/enums/permission.enum';
import { ForbiddenError, UnauthorizedError } from '../../src/domain/shared/errors/domain-error';

const session = (overrides: Partial<UserSessionContext> = {}): UserSessionContext => ({
  userId: 'u1',
  role: 'CASHIER',
  permissions: [PermissionCode.KITCHEN_VIEW],
  assignedBranchIds: ['branch-a'],
  isSuperAdmin: false,
  ...overrides,
});

describe('RbacGuard.assertAnyPermission', () => {
  it('passes when at least one permission matches', () => {
    expect(() =>
      RbacGuard.assertAnyPermission(session(), [PermissionCode.MANAGE_ORDERS, PermissionCode.KITCHEN_VIEW])
    ).not.toThrow();
  });

  it('throws Forbidden with the custom message when none match', () => {
    expect(() =>
      RbacGuard.assertAnyPermission(session(), [PermissionCode.MANAGE_ORDERS], 'custom denied')
    ).toThrow(new ForbiddenError('custom denied'));
  });

  it('throws Unauthorized without a session', () => {
    expect(() => RbacGuard.assertAnyPermission(null, [PermissionCode.MANAGE_ORDERS])).toThrow(UnauthorizedError);
  });

  it('lets super admin through', () => {
    expect(() =>
      RbacGuard.assertAnyPermission(session({ permissions: [], isSuperAdmin: true }), [PermissionCode.MANAGE_ORDERS])
    ).not.toThrow();
  });
});

describe('BranchContextService scope', () => {
  it('super admin scope is unrestricted', () => {
    const scope = BranchContextService.scopeOf(session({ isSuperAdmin: true }));
    expect(scope.allowedBranchIds).toBeNull();
    expect(() => BranchContextService.assertResourceInScope(scope, 'any-branch')).not.toThrow();
  });

  it('staff scope is limited to assigned branches', () => {
    const scope = BranchContextService.scopeOf(session());
    expect(() => BranchContextService.assertResourceInScope(scope, 'branch-a')).not.toThrow();
    expect(() => BranchContextService.assertResourceInScope(scope, 'branch-b')).toThrow(ForbiddenError);
  });

  it('unassigned (null-branch) resources remain visible', () => {
    const scope = BranchContextService.scopeOf(session());
    expect(() => BranchContextService.assertResourceInScope(scope, null)).not.toThrow();
  });

  it('a user with no branches cannot touch branch-owned resources', () => {
    const scope = BranchContextService.scopeOf(session({ assignedBranchIds: [] }));
    expect(() => BranchContextService.assertResourceInScope(scope, 'branch-a')).toThrow(ForbiddenError);

  });
});
