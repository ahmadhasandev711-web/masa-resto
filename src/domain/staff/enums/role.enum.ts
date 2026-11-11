import { PermissionCode } from './permission.enum';

/**
 * Built-in System Roles
 */
export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  CASHIER = 'CASHIER',
  KITCHEN = 'KITCHEN',
  ACCOUNTANT = 'ACCOUNTANT',
}

export interface SystemRoleDefinition {
  name: SystemRole;
  description: string;
  isSystem: boolean;
  defaultPermissions: PermissionCode[];
}

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    name: SystemRole.SUPER_ADMIN,
    description: 'مدير عام النظام - كامل الصلاحيات الإدارية والتشغيلية والمالية',
    isSystem: true,
    defaultPermissions: Object.values(PermissionCode),
  },
  {
    name: SystemRole.BRANCH_MANAGER,
    description: 'مدير فرع - إدارة العمليات الميدانية والورديات والمخزون في نطاق الفرع',
    isSystem: true,
    defaultPermissions: [
      PermissionCode.VIEW_REPORTS,
      PermissionCode.MANAGE_MENU,
      PermissionCode.MANAGE_ORDERS,
      PermissionCode.POS_ACCESS,
      PermissionCode.APPLY_POS_DISCOUNT,
      PermissionCode.MANAGE_CUSTOMERS,
      PermissionCode.MANAGE_INVENTORY,
      PermissionCode.MANAGE_FINANCE,
      PermissionCode.VOID_PAID_ORDER,
      PermissionCode.KITCHEN_VIEW,
      PermissionCode.KITCHEN_BUMP,
    ],
  },
  {
    name: SystemRole.ACCOUNTANT,
    description: 'محاسب مالي - استعراض التقارير والتحليلات ومتابعة الورديات والمصروفات',
    isSystem: true,
    defaultPermissions: [
      PermissionCode.VIEW_REPORTS,
      PermissionCode.MANAGE_FINANCE,
    ],
  },
  {
    name: SystemRole.CASHIER,
    description: 'كاشير - تشغيل شاشات البيع والورديات النقدية واستلام الطلبات',
    isSystem: true,
    defaultPermissions: [
      PermissionCode.POS_ACCESS,
      PermissionCode.MANAGE_ORDERS,
      PermissionCode.MANAGE_CUSTOMERS,
    ],
  },
  {
    name: SystemRole.KITCHEN,
    description: 'طاقم المطبخ - متابعة وإعداد الطلبات المستلمة وتجهيزها',
    isSystem: true,
    defaultPermissions: [
      PermissionCode.KITCHEN_VIEW,
      PermissionCode.KITCHEN_BUMP,
    ],
  },
];
