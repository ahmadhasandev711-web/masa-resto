import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Coins,
  ShoppingBag,
  Store,
  ChefHat,
  Receipt,
  Wallet,
  Package,
  Armchair,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ShieldCheck,
  Activity,
  Check,
} from 'lucide-react';
import { prisma } from '../../../infrastructure/db/prisma';
import { SessionService } from '../../../infrastructure/auth/session.service';
import { BranchContextService } from '../../../infrastructure/auth/branch-context.service';
import { RbacGuard } from '../../../infrastructure/auth/rbac-guard';
import { PermissionCode } from '../../../domain/staff/enums/permission.enum';
import { Money } from '../../../domain/shared/value-objects/money';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await SessionService.getCurrent();
  if (!session) redirect('/login');

  const cookieStore = await cookies();
  const activeBranchIdFromCookie = cookieStore.get('resto_active_branch_id')?.value;

  // Resolve and verify active branch access according to branch scoping (GR-8.3)
  let verifiedBranchId: string | null = null;
  try {
    verifiedBranchId = await BranchContextService.assertBranchAccess(
      session,
      activeBranchIdFromCookie
    );
  } catch {
    verifiedBranchId = null;
  }

  // 1. Fetch Contextual Core Data
  const [settings, userProfile, activeBranch] = await Promise.all([
    prisma.restaurantSetting.findFirst(),
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: { select: { name: true, description: true } } },
    }),
    verifiedBranchId
      ? prisma.branch.findUnique({
          where: { id: verifiedBranchId },
          select: { id: true, code: true, nameAr: true, nameEn: true, phone: true },
        })
      : null,
  ]);

  const currency = settings?.currency || 'EGP';
  const currencySymbol = settings?.currencySymbol || 'ج.م';

  // 2. Today's Date Range Boundaries
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const arabicDate = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const branchScope = verifiedBranchId ? { branchId: verifiedBranchId } : {};

  // 3. Operational Data Queries (Scoped to Active Branch & RBAC)
  const [
    todayPaidOrders,
    todayTotalOrdersCount,
    activeInFlightOrdersCount,
    pendingWebOrdersCount,
    openCashShift,
    tables,
    branchInventories,
    recentOrders,
    orgStats,
  ] = await Promise.all([
    // Today's Paid Orders for Revenue Calculation
    prisma.order.findMany({
      where: {
        ...branchScope,
        createdAt: { gte: startOfToday, lte: endOfToday },
        paymentStatus: 'PAID',
      },
      select: { totalMinor: true },
    }),

    // Total orders placed today
    prisma.order.count({
      where: {
        ...branchScope,
        createdAt: { gte: startOfToday, lte: endOfToday },
      },
    }),

    // Active in-flight orders right now
    prisma.order.count({
      where: {
        ...branchScope,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'] },
      },
    }),

    // Pending unassigned web delivery orders
    prisma.order.count({
      where: {
        ...branchScope,
        status: 'PENDING',
      },
    }),

    // Open cash shift for current branch
    verifiedBranchId
      ? prisma.cashShift.findFirst({
          where: { branchId: verifiedBranchId, status: 'OPEN' },
          include: { cashier: { select: { fullName: true } } },
          orderBy: { openedAt: 'desc' },
        })
      : null,

    // Dining tables for occupancy calculation
    verifiedBranchId
      ? prisma.diningTable.findMany({
          where: { branchId: verifiedBranchId, isActive: true },
          select: { status: true },
        })
      : [],

    // Low stock verification
    verifiedBranchId && RbacGuard.hasPermission(session, PermissionCode.MANAGE_INVENTORY)
      ? prisma.branchInventory.findMany({
          where: { branchId: verifiedBranchId },
          include: { inventoryItem: { select: { nameAr: true, unit: true } } },
        })
      : [],

    // 5 Most recent orders in active branch
    prisma.order.findMany({
      where: branchScope,
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        source: true,
        status: true,
        paymentStatus: true,
        totalMinor: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        customer: { select: { fullName: true } },
      },
    }),

    // Organization stats (For Super Admin overview)
    session.isSuperAdmin
      ? Promise.all([
          prisma.branch.count({ where: { isActive: true } }),
          prisma.user.count({ where: { isActive: true } }),
          prisma.product.count({ where: { isActive: true } }),
          prisma.customer.count(),
        ])
      : null,
  ]);

  // Financial calculations via Money Value Object (GR-1.1 & GR-8.2)
  const todayRevenueMoney = todayPaidOrders.reduce(
    (acc: Money, o: { totalMinor: number }) => acc.add(Money.fromMinor(o.totalMinor, currency)),
    Money.zero(currency)
  );

  // Table Occupancy stats
  const totalTablesCount = tables.length;
  const occupiedTablesCount = tables.filter((t: { status: string }) => t.status === 'OCCUPIED').length;
  const occupancyPercentage =
    totalTablesCount > 0 ? Math.round((occupiedTablesCount / totalTablesCount) * 100) : 0;

  // Low stock items count
  const lowStockCount = branchInventories.filter(
    (bi) => Number(bi.quantity) <= Number(bi.minThreshold)
  ).length;

  const displayName = userProfile?.fullName ?? 'المستخدم';
  const roleName = userProfile?.role?.name ?? session.role;

  // Format minor to major with currency
  const formatMoney = (minor: number) => {
    return `${(minor / 100).toFixed(2)} ${currencySymbol}`;
  };

  return (
    <div className="space-y-6 pb-8" dir="rtl">
      {/* 1. Contextual Executive Welcome Banner */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 shadow-2xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-xs font-bold font-mono">
                <ShieldCheck className="size-3.5 text-zinc-500" />
                <span>{roleName}</span>
              </span>
              {activeBranch && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold font-mono">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{activeBranch.nameAr} ({activeBranch.code})</span>
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
              مرحباً، {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 font-medium">
              قمرة القيادة التشغيلية للمطعم • نظرة حية على مبيعات اليوم، حالة الصالة، والورديات المفتوحة
            </p>
          </div>

          {/* Date & System Status */}
          <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200/80">
              <Clock className="size-3.5 text-zinc-400" />
              <span>{arabicDate}</span>
            </div>
            <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
              <Activity className="size-3 text-emerald-500" />
              <span>النظام متصل وقنوات التشغيل نشطة</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Operational Intelligence Alerts (Shown when actionable conditions occur) */}
      {(pendingWebOrdersCount > 0 || lowStockCount > 0 || !openCashShift) && (
        <div className="space-y-2.5">
          {pendingWebOrdersCount > 0 && RbacGuard.hasPermission(session, PermissionCode.MANAGE_ORDERS) && (
            <div className="flex items-center justify-between p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-rose-500 animate-ping" />
                <span className="font-bold">
                  تنبيه الطلبات: يوجد {pendingWebOrdersCount} طلب توصيل جديد وارد من الموقع بانتظار الاعتماد والإسناد!
                </span>
              </div>
              <Link
                href="/admin/orders"
                className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition flex items-center gap-1 shrink-0"
              >
                <span>مركز الطلبات</span>
                <ChevronLeft className="size-3" />
              </Link>
            </div>
          )}

          {lowStockCount > 0 && RbacGuard.hasPermission(session, PermissionCode.MANAGE_INVENTORY) && (
            <div className="flex items-center justify-between p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                <span className="font-bold">
                  تنبيه المخزون: يوجد {lowStockCount} من الخامات في هذا الفرع وصلت لحد إعادة الطلب أو أوشكت على النفاد.
                </span>
              </div>
              <Link
                href="/admin/inventory"
                className="px-3 py-1 bg-amber-700 text-white font-bold rounded-lg hover:bg-amber-800 transition flex items-center gap-1 shrink-0"
              >
                <span>فحص النواقص</span>
                <ChevronLeft className="size-3" />
              </Link>
            </div>
          )}

          {!openCashShift && (RbacGuard.hasPermission(session, PermissionCode.POS_ACCESS) || RbacGuard.hasPermission(session, PermissionCode.MANAGE_FINANCE)) && (
            <div className="flex items-center justify-between p-3.5 bg-zinc-100 border border-zinc-300/80 rounded-xl text-xs text-zinc-800">
              <div className="flex items-center gap-2.5">
                <Wallet className="size-4 text-zinc-500 shrink-0" />
                <span>
                  لا توجد وردية مالية مفتوحة حالياً في هذا الفرع. يرجى فتح وردية جديدة قبل بدء تسجيل المبيعات.
                </span>
              </div>
              <Link
                href="/admin/finance"
                className="px-3 py-1 bg-zinc-900 text-white font-bold rounded-lg hover:bg-zinc-800 transition flex items-center gap-1 shrink-0"
              >
                <span>فتح وردية</span>
                <ChevronLeft className="size-3" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 3. Live Operational Pulse (Today's Key Performance Indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Today's Revenue (Role Protected) */}
        {(session.isSuperAdmin ||
          RbacGuard.hasPermission(session, PermissionCode.VIEW_REPORTS) ||
          RbacGuard.hasPermission(session, PermissionCode.MANAGE_ORDERS)) && (
          <div className="bg-white p-4.5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">مبيعات اليوم المحصلة</span>
              <div className="size-8 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
                <Coins className="size-4" strokeWidth={2} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-black text-zinc-900 font-mono tracking-tight">
                {formatMoney(todayRevenueMoney.amount)}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 font-medium">
                إجمالي {todayPaidOrders.length} فاتورة مسددة اليوم
              </p>
            </div>
          </div>
        )}

        {/* Metric 2: In-Flight Orders */}
        {(session.isSuperAdmin || RbacGuard.hasPermission(session, PermissionCode.MANAGE_ORDERS)) && (
          <div className="bg-white p-4.5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">الطلبات النشطة الآن</span>
              <div className="size-8 rounded-xl bg-blue-50 text-blue-700 grid place-items-center">
                <ShoppingBag className="size-4" strokeWidth={2} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-black text-blue-700 font-mono tracking-tight">
                {activeInFlightOrdersCount}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 font-medium">
                من إجمالي {todayTotalOrdersCount} طلب سُجلت اليوم
              </p>
            </div>
          </div>
        )}

        {/* Metric 3: Table Occupancy */}
        {(session.isSuperAdmin || RbacGuard.hasPermission(session, PermissionCode.MANAGE_BRANCHES)) && (
          <div className="bg-white p-4.5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">إشغال الصالة والطاولات</span>
              <div className="size-8 rounded-xl bg-amber-50 text-amber-700 grid place-items-center">
                <Armchair className="size-4" strokeWidth={2} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-zinc-900 font-mono">
                  {occupiedTablesCount}/{totalTablesCount}
                </span>
                <span className="text-xs font-bold text-amber-700 font-mono">
                  ({occupancyPercentage}%)
                </span>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-amber-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(occupancyPercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Metric 4: Current Cash Shift Status */}
        {(session.isSuperAdmin ||
          RbacGuard.hasPermission(session, PermissionCode.MANAGE_FINANCE) ||
          RbacGuard.hasPermission(session, PermissionCode.POS_ACCESS)) && (
          <div className="bg-white p-4.5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">الوردية المالية الحالية</span>
              <div className="size-8 rounded-xl bg-zinc-100 text-zinc-700 grid place-items-center">
                <Wallet className="size-4" strokeWidth={2} />
              </div>
            </div>
            <div className="mt-3">
              {openCashShift ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-bold text-emerald-800">
                      مفتوحة • {openCashShift.cashier?.fullName || 'الكاشير'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                    عهدة الافتتاح: {formatMoney(openCashShift.openingCashMinor)}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="text-sm font-bold text-zinc-500">لا توجد وردية مفتوحة</span>
                  <p className="text-[11px] text-zinc-400 mt-1">الدرج مغلق حالياً</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Tactical Launchpad (Immediate Touch Action Buttons) */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          الإجراءات والعمليات السريعة
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Action 1: POS Screen */}
          {RbacGuard.hasPermission(session, PermissionCode.POS_ACCESS) && (
            <Link
              href="/pos"
              className="group p-4 bg-zinc-900 text-white rounded-2xl shadow-xs hover:bg-zinc-800 transition flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-white/10 grid place-items-center text-white">
                  <Store className="size-5" strokeWidth={1.8} />
                </div>
                <ChevronLeft className="size-4 text-zinc-400 group-hover:text-white group-hover:-translate-x-0.5 transition" />
              </div>
              <div>
                <p className="text-sm font-bold">شاشة الكاشير (POS)</p>
                <span className="text-[11px] text-zinc-400">مبيعات الصالة والسفري</span>
              </div>
            </Link>
          )}

          {/* Action 2: Online Order Center */}
          {RbacGuard.hasPermission(session, PermissionCode.MANAGE_ORDERS) && (
            <Link
              href="/admin/orders"
              className="group p-4 bg-white border border-zinc-200 text-zinc-900 rounded-2xl shadow-2xs hover:border-zinc-300 transition flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center">
                  <ShoppingBag className="size-5" strokeWidth={1.8} />
                </div>
                {pendingWebOrdersCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold font-mono">
                    {pendingWebOrdersCount} جديد
                  </span>
                ) : (
                  <ChevronLeft className="size-4 text-zinc-400 group-hover:text-zinc-900 group-hover:-translate-x-0.5 transition" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold">مركز الطلبات</p>
                <span className="text-[11px] text-zinc-500">إدارة طلبات التوصيل</span>
              </div>
            </Link>
          )}

          {/* Action 3: Kitchen Display */}
          {RbacGuard.hasPermission(session, PermissionCode.KITCHEN_VIEW) && (
            <Link
              href="/admin/kitchen"
              className="group p-4 bg-white border border-zinc-200 text-zinc-900 rounded-2xl shadow-2xs hover:border-zinc-300 transition flex flex-col justify-between min-h-[110px]"
            >
              <div className="size-9 rounded-xl bg-zinc-100 text-zinc-700 grid place-items-center">
                <ChefHat className="size-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-bold">شاشة المطبخ (KDS)</p>
                <span className="text-[11px] text-zinc-500">متابعة تذاكر الطهي الحية</span>
              </div>
            </Link>
          )}

          {/* Action 4: Invoices Audit */}
          {(RbacGuard.hasPermission(session, PermissionCode.MANAGE_ORDERS) ||
            RbacGuard.hasPermission(session, PermissionCode.VIEW_REPORTS)) && (
            <Link
              href="/admin/invoices"
              className="group p-4 bg-white border border-zinc-200 text-zinc-900 rounded-2xl shadow-2xs hover:border-zinc-300 transition flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-zinc-100 text-zinc-700 grid place-items-center">
                  <Receipt className="size-5" strokeWidth={1.8} />
                </div>
                <ChevronLeft className="size-4 text-zinc-400 group-hover:text-zinc-900 group-hover:-translate-x-0.5 transition" />
              </div>
              <div>
                <p className="text-sm font-bold">سجل الفواتير</p>
                <span className="text-[11px] text-zinc-500">طباعة ومراجعة البونات</span>
              </div>
            </Link>
          )}

          {/* Action 5: Finance & Shifts */}
          {RbacGuard.hasPermission(session, PermissionCode.MANAGE_FINANCE) && (
            <Link
              href="/admin/finance"
              className="group p-4 bg-white border border-zinc-200 text-zinc-900 rounded-2xl shadow-2xs hover:border-zinc-300 transition flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-zinc-100 text-zinc-700 grid place-items-center">
                  <Wallet className="size-5" strokeWidth={1.8} />
                </div>
                <ChevronLeft className="size-4 text-zinc-400 group-hover:text-zinc-900 group-hover:-translate-x-0.5 transition" />
              </div>
              <div>
                <p className="text-sm font-bold">المالية والورديات</p>
                <span className="text-[11px] text-zinc-500">إغلاق وردية ومصروفات</span>
              </div>
            </Link>
          )}

          {/* Action 6: Inventory */}
          {RbacGuard.hasPermission(session, PermissionCode.MANAGE_INVENTORY) && (
            <Link
              href="/admin/inventory"
              className="group p-4 bg-white border border-zinc-200 text-zinc-900 rounded-2xl shadow-2xs hover:border-zinc-300 transition flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-zinc-100 text-zinc-700 grid place-items-center">
                  <Package className="size-5" strokeWidth={1.8} />
                </div>
                <ChevronLeft className="size-4 text-zinc-400 group-hover:text-zinc-900 group-hover:-translate-x-0.5 transition" />
              </div>
              <div>
                <p className="text-sm font-bold">المخزون والوصفات</p>
                <span className="text-[11px] text-zinc-500">أرصدة الخامات والـ BOM</span>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* 5. Recent Branch Operations Feed (Live Activity) */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-zinc-100 text-zinc-800 grid place-items-center">
              <Activity className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900">آخر العمليات والطلبات</h3>
              <p className="text-[11px] text-zinc-500">أحدث 5 طلبات تم تسجيلها في هذا الفرع</p>
            </div>
          </div>

          <Link
            href="/admin/invoices"
            className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 transition"
          >
            <span>عرض سجل الفواتير كاملاً</span>
            <ChevronLeft className="size-3.5" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400 font-medium">
            لا توجد أي طلبات مسجلة في هذا الفرع حتى الآن.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {recentOrders.map((order) => {
              const typeLabel =
                order.type === 'DINE_IN'
                  ? `صالة ${order.table?.tableNumber ? `(طاولة ${order.table.tableNumber})` : ''}`
                  : order.type === 'TAKEAWAY'
                  ? 'سفري'
                  : `توصيل ${order.customer?.fullName ? `(${order.customer.fullName})` : ''}`;

              const isPaid = order.paymentStatus === 'PAID';

              return (
                <div
                  key={order.id}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-black text-zinc-900 bg-zinc-100 px-2 py-1 rounded-lg">
                      {order.orderNumber}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-800">{typeLabel}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isPaid ? 'مدفوعة' : 'شيك مفتوح'}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block">
                        {new Intl.DateTimeFormat('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(order.createdAt))}
                        {' • '}
                        {order.source === 'POS' ? 'كاشير الفرع' : 'أونلاين (الموقع)'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className="font-mono text-sm font-black text-zinc-900">
                      {formatMoney(order.totalMinor)}
                    </span>
                    <Link
                      href={`/admin/invoices`}
                      className="px-2.5 py-1 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition"
                    >
                      معاينة
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Organization & Strategic Foundation (Visible to Super Admin) */}
      {session.isSuperAdmin && orgStats && (
        <div className="space-y-3 pt-2">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            نظرة المنظومة المركزية (Super Admin)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/admin/branches"
              className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-2xs hover:border-zinc-300 transition"
            >
              <span className="text-[11px] font-medium text-zinc-400 block">الفروع النشطة</span>
              <span className="text-2xl font-black text-zinc-900 font-mono mt-1 block">
                {orgStats[0]}
              </span>
              <span className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
                <Check className="size-3" />
                <span>نطاق فروع موحد</span>
              </span>
            </Link>

            <Link
              href="/admin/staff"
              className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-2xs hover:border-zinc-300 transition"
            >
              <span className="text-[11px] font-medium text-zinc-400 block">فريق العمل (RBAC)</span>
              <span className="text-2xl font-black text-zinc-900 font-mono mt-1 block">
                {orgStats[1]}
              </span>
              <span className="text-[10px] text-zinc-500 font-medium mt-1 block">
                موظفين وصلاحيات
              </span>
            </Link>

            <Link
              href="/admin/menu"
              className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-2xs hover:border-zinc-300 transition"
            >
              <span className="text-[11px] font-medium text-zinc-400 block">أصناف الكتالوج</span>
              <span className="text-2xl font-black text-zinc-900 font-mono mt-1 block">
                {orgStats[2]}
              </span>
              <span className="text-[10px] text-zinc-500 font-medium mt-1 block">
                منيو وإضافات جاهزة
              </span>
            </Link>

            <Link
              href="/admin/customers"
              className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-2xs hover:border-zinc-300 transition"
            >
              <span className="text-[11px] font-medium text-zinc-400 block">عملاء الـ CRM</span>
              <span className="text-2xl font-black text-zinc-900 font-mono mt-1 block">
                {orgStats[3]}
              </span>
              <span className="text-[10px] text-zinc-500 font-medium mt-1 block">
                سجل موحد للعملاء
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
