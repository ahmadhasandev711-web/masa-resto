import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '../../../../infrastructure/db/prisma';
import { SessionService } from '../../../../infrastructure/auth/session.service';
import { BranchContextService } from '../../../../infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../../../domain/staff/enums/permission.enum';
import { ListOrdersUseCase } from '../../../../application/ordering/use-cases/list-orders.use-case';
import { GetOrdersMetricsUseCase } from '../../../../application/ordering/use-cases/get-orders-metrics.use-case';
import { OrdersCockpitClient } from './orders-cockpit-client';
import { DetailedOrder, BranchOption } from './order-detail-modal';

export const metadata: Metadata = {
  title: 'مركز إدارة الطلبات | منظومة المطعم',
  description: 'قمرة القيادة الحية لمتابعة وإسناد طلبات التوصيل الإلكترونية',
};

export default async function AdminOrdersPage() {
  const session = await SessionService.getCurrent();
  if (!session) {
    redirect('/login');
  }

  // RBAC Permission Check (GR-1.4)
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_ORDERS);
  } catch {
    redirect('/admin');
  }

  const canManageAllBranches =
    session.isSuperAdmin ||
    session.permissions.includes(PermissionCode.MANAGE_BRANCHES);

  const isBranchRestricted = !canManageAllBranches;
  const userBranchId = session.assignedBranchIds[0] ?? null;

  const branchFilter = canManageAllBranches
    ? { isActive: true }
    : { id: { in: session.assignedBranchIds }, isActive: true };

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const startOfToday = `${todayStr}T00:00:00.000Z`;
  const endOfToday = `${todayStr}T23:59:59.999Z`;

  const [branches, setting, initialOrdersResult, initialMetrics] = await Promise.all([
    prisma.branch.findMany({
      where: branchFilter,
      select: { id: true, nameAr: true, code: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.restaurantSetting.findFirst({
      select: { nameAr: true, nameEn: true, currencySymbol: true },
    }),
    new ListOrdersUseCase().execute({
      branchId: isBranchRestricted && userBranchId ? userBranchId : undefined,
      dateFrom: startOfToday,
      dateTo: endOfToday,
      limit: 50,
    }),
    new GetOrdersMetricsUseCase().execute(isBranchRestricted && userBranchId ? userBranchId : undefined),
  ]);

  const detailedOrders = initialOrdersResult.orders as unknown as DetailedOrder[];
  const branchOptions = branches as BranchOption[];

  return (
    <OrdersCockpitClient
      initialOrders={detailedOrders}
      initialMetrics={initialMetrics}
      branches={branchOptions}
      currencySymbol={setting?.currencySymbol || 'ج.م'}
      restaurantNameAr={setting?.nameAr || 'مطعم ماسا'}
      restaurantNameEn={setting?.nameEn || 'MASA Kitchen'}
      isBranchRestricted={isBranchRestricted}
      userBranchId={userBranchId}
      canAssignBranch={canManageAllBranches}
      initialDateStr={todayStr}
    />
  );
}
