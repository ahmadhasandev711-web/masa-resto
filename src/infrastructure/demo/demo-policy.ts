import { ForbiddenError } from '../../domain/shared/errors/domain-error';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { SYSTEM_ROLES, SystemRole } from '../../domain/staff/enums/role.enum';

/** Exact copy shown on the showcase banner and the login page. */
export const DEMO_BANNER_TEXT = 'نسخة تجريبية — تتصفر كل 6 ساعات';

export const DEMO_RESTRICTED_ACTIONS = [
  'staff',
  'settings',
  'branch_create',
  'branch_update',
  'branch_toggle',
  'upload_image',
  'delete',
] as const;

export type DemoRestrictedAction = (typeof DEMO_RESTRICTED_ACTIONS)[number];

export interface DemoAccountDefinition {
  roleName: string;
  username: string;
  password: string;
  fullName: string;
  labelAr: string;
  mirrorRole: SystemRole;
}

/**
 * Public showcase accounts (D6). One login per operating role.
 * Passwords are intentionally visible on the demo login page.
 * None of these roles is SUPER_ADMIN.
 */
export const DEMO_ACCOUNTS: DemoAccountDefinition[] = [
  {
    roleName: 'DEMO_MANAGER',
    username: 'demo_manager',
    password: 'demo-manager',
    fullName: 'مدير التجربة',
    labelAr: 'مدير',
    mirrorRole: SystemRole.BRANCH_MANAGER,
  },
  {
    roleName: 'DEMO_CASHIER',
    username: 'demo_cashier',
    password: 'demo-cashier',
    fullName: 'كاشير التجربة',
    labelAr: 'كاشير',
    mirrorRole: SystemRole.CASHIER,
  },
  {
    roleName: 'DEMO_KITCHEN',
    username: 'demo_kitchen',
    password: 'demo-kitchen',
    fullName: 'مطبخ التجربة',
    labelAr: 'مطبخ',
    mirrorRole: SystemRole.KITCHEN,
  },
  {
    roleName: 'DEMO_ACCOUNTANT',
    username: 'demo_accountant',
    password: 'demo-accountant',
    fullName: 'محاسب التجربة',
    labelAr: 'محاسب',
    mirrorRole: SystemRole.ACCOUNTANT,
  },
];

export function isDemoMode(value?: string): boolean {
  if (arguments.length > 0) return value === 'true';
  return process.env.DEMO_MODE === 'true';
}

/**
 * `db:demo-reset` wipes every table. It must not run on a real restaurant database.
 * Only the exact string "true" is accepted.
 */
export function assertDemoResetAllowed(value?: string): void {
  const effective = arguments.length > 0 ? value : process.env.DEMO_MODE;
  if (effective !== 'true') {
    throw new Error(
      'db:demo-reset refused: DEMO_MODE must be exactly "true". This command truncates the database and is only allowed on the public showcase.'
    );
  }
}

/**
 * Showcase lock. When DEMO_MODE=true, staff, settings, branch mutations,
 * image upload, and every delete are rejected — including for a demo manager
 * who otherwise has menu permissions.
 */
export function assertDemoAllows(
  action: DemoRestrictedAction,
  demoMode?: string
): void {
  const effective = arguments.length > 1 ? demoMode : process.env.DEMO_MODE;
  if (effective !== 'true') return;
  throw new ForbiddenError(
    `النسخة التجريبية لا تسمح بهذا الإجراء. البيانات تتصفر كل 6 ساعات.`
  );
}

export function demoRolePermissions(account: DemoAccountDefinition): PermissionCode[] {
  const role = SYSTEM_ROLES.find((entry) => entry.name === account.mirrorRole);
  if (!role) {
    throw new Error(`Missing built-in role ${account.mirrorRole} for demo account ${account.username}`);
  }
  return role.defaultPermissions;
}

/** Cache bucket for the service worker. Derived from the app version, never from a customer name. */
export function serviceWorkerCacheName(version: string): string {
  const safe = version.trim().replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) {
    throw new Error('App version is required to name the service worker cache');
  }
  return `resto-v${safe}`;
}

export function assertSafeSqlIdentifier(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to touch unexpected table name: ${name}`);
  }
  return name;
}