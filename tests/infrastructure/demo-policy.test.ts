import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/domain/shared/errors/domain-error';
import {
  DEMO_ACCOUNTS,
  DEMO_BANNER_TEXT,
  assertDemoAllows,
  assertDemoResetAllowed,
  assertSafeSqlIdentifier,
  demoRolePermissions,
  serviceWorkerCacheName,
} from '../../src/infrastructure/demo/demo-policy';
import { renderServiceWorker } from '../../src/infrastructure/demo/service-worker-source';
import { PermissionCode } from '../../src/domain/staff/enums/permission.enum';

const BRAND = /قهوة كايرو|Qahwet|qahwet-cairo|ماسا|MASA/;

describe('Phase D: showcase guard', () => {
  it('rejects a delete from a demo account while DEMO_MODE is on', () => {
    expect(() => assertDemoAllows('delete', 'true')).toThrow(ForbiddenError);
    expect(() => assertDemoAllows('delete', 'true')).toThrow(/لا تسمح/);
  });

  it('rejects staff, settings, branch changes, and image upload in demo mode', () => {
    for (const action of ['staff', 'settings', 'branch_create', 'branch_update', 'branch_toggle', 'upload_image'] as const) {
      expect(() => assertDemoAllows(action, 'true')).toThrow(ForbiddenError);
    }
  });

  it('leaves the same actions available when the server is not a showcase', () => {
    expect(() => assertDemoAllows('delete', 'false')).not.toThrow();
    expect(() => assertDemoAllows('delete', undefined)).not.toThrow();
    expect(() => assertDemoAllows('staff', 'TRUE')).not.toThrow();
  });

  it('refuses db:demo-reset unless DEMO_MODE is exactly true', () => {
    expect(() => assertDemoResetAllowed('true')).not.toThrow();
    expect(() => assertDemoResetAllowed(undefined)).toThrow(/refused/);
    expect(() => assertDemoResetAllowed('false')).toThrow(/refused/);
    expect(() => assertDemoResetAllowed('TRUE')).toThrow(/refused/);
  });

  it('gives each showcase role the matching operator permissions and never staff or settings', () => {
    expect(DEMO_ACCOUNTS.map((account) => account.roleName)).toEqual([
      'DEMO_MANAGER',
      'DEMO_CASHIER',
      'DEMO_KITCHEN',
      'DEMO_ACCOUNTANT',
    ]);
    for (const account of DEMO_ACCOUNTS) {
      const permissions = demoRolePermissions(account);
      expect(permissions).not.toContain(PermissionCode.MANAGE_STAFF);
      expect(permissions).not.toContain(PermissionCode.MANAGE_SETTINGS);
      expect(permissions).not.toContain(PermissionCode.MANAGE_BRANCHES);
    }
    expect(demoRolePermissions(DEMO_ACCOUNTS[0])).toContain(PermissionCode.MANAGE_MENU);
    expect(demoRolePermissions(DEMO_ACCOUNTS[1])).toContain(PermissionCode.POS_ACCESS);
    expect(demoRolePermissions(DEMO_ACCOUNTS[2])).toContain(PermissionCode.KITCHEN_VIEW);
    expect(demoRolePermissions(DEMO_ACCOUNTS[3])).toContain(PermissionCode.VIEW_REPORTS);
  });

  it('names the service worker cache from the app version', () => {
    expect(serviceWorkerCacheName('0.1.0')).toBe('resto-v0.1.0');
    const source = renderServiceWorker('0.1.0');
    expect(source).toContain("const CACHE_NAME = 'resto-v0.1.0';");
    expect(source).not.toMatch(BRAND);
    expect(DEMO_BANNER_TEXT).toBe('نسخة تجريبية — تتصفر كل 6 ساعات');
  });

  it('rejects table names that are not plain identifiers', () => {
    expect(assertSafeSqlIdentifier('orders')).toBe('orders');
    expect(() => assertSafeSqlIdentifier('orders; DROP TABLE users')).toThrow(/unexpected table/);
  });

  it('causes Server Actions to reject forbidden demo modifications gracefully', async () => {
    const originalEnv = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';

    try {
      const { createStaffAction } = await import('../../src/app/actions/staff.actions');
      const { updateSettingsAction } = await import('../../src/app/actions/settings.actions');
      const { createBranchAction } = await import('../../src/app/actions/branch.actions');

      const staffRes = await createStaffAction({
        username: 'new_user',
        fullName: 'New User',
        phone: '01012345678',
        password: 'Password@123',
        roleId: 'role-1',
        branchIds: ['branch-1'],
      });
      expect(staffRes.success).toBe(false);
      if (!staffRes.success) {
        expect(staffRes.code).toBe('FORBIDDEN');
        expect(staffRes.error).toContain('النسخة التجريبية لا تسمح بهذا الإجراء');
      }

      const settingsRes = await updateSettingsAction({
        nameAr: 'تعديل',
        nameEn: 'Edit',
        currency: 'EGP',
        currencySymbol: 'ج.م',
        locale: 'ar-EG',
        taxRatePercent: 14,
        deliveryFee: 1500,
      });
      expect(settingsRes.success).toBe(false);
      if (!settingsRes.success) {
        expect(settingsRes.code).toBe('FORBIDDEN');
        expect(settingsRes.error).toContain('النسخة التجريبية لا تسمح بهذا الإجراء');
      }

      const branchRes = await createBranchAction({
        nameAr: 'فرع جديد',
        nameEn: 'New Branch',
        code: 'NEW-01',
        phone: '01011111111',
        address: 'عنوان',
      });
      expect(branchRes.success).toBe(false);
      if (!branchRes.success) {
        expect(branchRes.code).toBe('FORBIDDEN');
        expect(branchRes.error).toContain('النسخة التجريبية لا تسمح بهذا الإجراء');
      }
    } finally {
      process.env.DEMO_MODE = originalEnv;
    }
  }, 15000);
});
