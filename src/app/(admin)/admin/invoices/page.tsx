import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '../../../../infrastructure/db/prisma';
import { SessionService } from '../../../../infrastructure/auth/session.service';
import { BranchContextService } from '../../../../infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../../../domain/staff/enums/permission.enum';
import { ListOrdersUseCase } from '../../../../application/ordering/use-cases/list-orders.use-case';
import { InvoicesClient, InvoiceOrderRecord, BranchOption, CashierOption } from './invoices-client';

export const metadata: Metadata = {
  title: 'سجل ومراجعة الفواتير | منظومة المطعم',
  description: 'قمرة التدقيق المالي ومراجعة فواتير الصالة ونقاط البيع والتوصيل',
};

export default async function AdminInvoicesPage() {
  const session = await SessionService.getCurrent();
  if (!session) {
    redirect('/login');
  }

  // RBAC Permission Check (MANAGE_ORDERS or VIEW_REPORTS)
  const hasAccess =
    session.isSuperAdmin ||
    session.permissions.includes(PermissionCode.MANAGE_ORDERS) ||
    session.permissions.includes(PermissionCode.VIEW_REPORTS);

  if (!hasAccess) {
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

  const [branches, setting, cashiers, initialOrdersResult] = await Promise.all([
    prisma.branch.findMany({
      where: branchFilter,
      select: { id: true, nameAr: true, code: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.restaurantSetting.findFirst({
      select: { nameAr: true, nameEn: true, currencySymbol: true, currency: true },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: 'asc' },
    }),
    new ListOrdersUseCase().execute({
      source: 'ALL',
      branchId: isBranchRestricted && userBranchId ? userBranchId : undefined,
      limit: 25,
    }),
  ]);

  const orders = initialOrdersResult.orders as unknown as InvoiceOrderRecord[];

  return (
    <InvoicesClient
      initialOrders={orders}
      initialTotalCount={initialOrdersResult.pagination.total}
      initialMetrics={initialOrdersResult.metrics}
      branches={branches as BranchOption[]}
      cashiers={cashiers as CashierOption[]}
      currencySymbol={setting?.currencySymbol || 'ج.م'}
      restaurantNameAr={setting?.nameAr || 'مطعم ماسا'}
      restaurantNameEn={setting?.nameEn || 'MASA Kitchen'}
      isBranchRestricted={isBranchRestricted}
      userBranchId={userBranchId}
    />
  );
}
