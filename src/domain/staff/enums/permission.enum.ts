/**
 * Capability-based permissions used throughout the system.
 * Strictly defined as TypeScript Enums to prevent magic strings (GR-8.1).
 */
export enum PermissionCode {
  // System & Organization
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  MANAGE_BRANCHES = 'MANAGE_BRANCHES',
  MANAGE_STAFF = 'MANAGE_STAFF',
  VIEW_REPORTS = 'VIEW_REPORTS',

  // Operations
  MANAGE_MENU = 'MANAGE_MENU',
  MANAGE_ORDERS = 'MANAGE_ORDERS',
  POS_ACCESS = 'POS_ACCESS',
  APPLY_POS_DISCOUNT = 'APPLY_POS_DISCOUNT',
  MANAGE_CUSTOMERS = 'MANAGE_CUSTOMERS',
  KITCHEN_VIEW = 'KITCHEN_VIEW',
  KITCHEN_BUMP = 'KITCHEN_BUMP',

  // Supply & Money
  MANAGE_INVENTORY = 'MANAGE_INVENTORY',
  MANAGE_FINANCE = 'MANAGE_FINANCE',
  VOID_PAID_ORDER = 'VOID_PAID_ORDER',
}

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  category: 'ADMIN' | 'OPERATIONS' | 'FINANCE' | 'INVENTORY';
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  {
    code: PermissionCode.MANAGE_SETTINGS,
    name: 'إدارة الإعدادات العامة',
    category: 'ADMIN',
    description: 'تعديل هوية المطعم، العملة، الضرائب، ومعلومات التواصل',
  },
  {
    code: PermissionCode.MANAGE_BRANCHES,
    name: 'إدارة الفروع',
    category: 'ADMIN',
    description: 'إضافة وتعديل وتفعيل فروع المطعم',
  },
  {
    code: PermissionCode.MANAGE_STAFF,
    name: 'إدارة الموظفين والصلاحيات',
    category: 'ADMIN',
    description: 'إضافة وتعديل حسابات الموظفين والأدوار',
  },
  {
    code: PermissionCode.VIEW_REPORTS,
    name: 'عرض التقارير والتحليلات',
    category: 'ADMIN',
    description: 'الاطلاع على تقارير المبيعات والأداء المالي',
  },
  {
    code: PermissionCode.MANAGE_MENU,
    name: 'إدارة قائمة الطعام والمنتجات',
    category: 'OPERATIONS',
    description: 'تعديل الأصناف والأسعار والإضافات وتوفر المنتجات',
  },
  {
    code: PermissionCode.MANAGE_ORDERS,
    name: 'إدارة الطلبات والتوصيل',
    category: 'OPERATIONS',
    description: 'قبول وتعديل وإسناد طلبات الأونلاين والتوصيل للفروع',
  },
  {
    code: PermissionCode.POS_ACCESS,
    name: 'استخدام نقطة البيع (POS)',
    category: 'OPERATIONS',
    description: 'فتح الوردية وتسجيل مبيعات الصالة والسفري المباشرة',
  },
  {
    code: PermissionCode.APPLY_POS_DISCOUNT,
    name: 'تطبيق خصم على طلبات نقطة البيع',
    category: 'OPERATIONS',
    description: 'منح خصم مالي على طلبات الصالة والسفري مع توثيقه في الفاتورة',
  },
  {
    code: PermissionCode.MANAGE_CUSTOMERS,
    name: 'إدارة الزبائن وسجل العناوين',
    category: 'OPERATIONS',
    description: 'استعراض بيانات العملاء، تحديث العناوين، وسجل الطلبات',
  },
  {
    code: PermissionCode.KITCHEN_VIEW,
    name: 'عرض شاشة المطبخ (KDS)',
    category: 'OPERATIONS',
    description: 'استعراض تذاكر الطهي الحية للشيف وطاقم التحضير',
  },
  {
    code: PermissionCode.KITCHEN_BUMP,
    name: 'تجهيز وإنهاء طلبات المطبخ (Bump)',
    category: 'OPERATIONS',
    description: 'تغيير حالة الطلب إلى جاهز وشطب الأصناف المنجزة',
  },
  {
    code: PermissionCode.MANAGE_INVENTORY,
    name: 'إدارة المخزون والمشتريات',
    category: 'INVENTORY',
    description: 'متابعة المكونات والوصفات وحركات المخزون والموردين',
  },
  {
    code: PermissionCode.MANAGE_FINANCE,
    name: 'إدارة الورديات والمصروفات المالية',
    category: 'FINANCE',
    description: 'تسجيل المصروفات وإغلاق ورديات الكاشير واعتماد الفروقات',
  },
  {
    code: PermissionCode.VOID_PAID_ORDER,
    name: 'إلغاء واسترجاع الطلبات المدفوعة (Void/Refund)',
    category: 'FINANCE',
    description: 'إلغاء الطلبات المحصلة مع إصدار إشعار مرتجع وتسجيل الخصم النقدي للوردية',
  },
];
