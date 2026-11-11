import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '../../../../infrastructure/db/prisma';
import { SessionService } from '../../../../infrastructure/auth/session.service';
import { BranchContextService } from '../../../../infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../../../domain/staff/enums/permission.enum';
import { GetKitchenOrdersUseCase } from '../../../../application/kitchen/use-cases/get-kitchen-orders.use-case';
import { KitchenKdsClient } from './kitchen-kds-client';

export const metadata: Metadata = {
  title: 'شاشة المطبخ (KDS) | منظومة المطعم',
  description: 'نظام إدارة تذاكر المطبخ التفاعلي وتحضير الطلبات الحية',
};

export default async function AdminKitchenPage() {
  const session = await SessionService.getCurrent();
  if (!session) {
    redirect('/login');
  }

  // RBAC Permission Check
  const hasAccess =
    session.isSuperAdmin ||
    session.permissions.includes(PermissionCode.KITCHEN_VIEW) ||
    session.permissions.includes(PermissionCode.MANAGE_ORDERS);

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

  const [branches, setting, initialOrders] = await Promise.all([
    prisma.branch.findMany({
      where: branchFilter,
      select: { id: true, nameAr: true, code: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.restaurantSetting.findFirst({
      select: { nameAr: true, nameEn: true },
    }),
    new GetKitchenOrdersUseCase().execute({
      branchId: isBranchRestricted && userBranchId ? userBranchId : undefined,
    }),
  ]);

  return (
    <KitchenKdsClient
      initialOrders={initialOrders}
      branches={branches}
      restaurantNameAr={setting?.nameAr || 'مطعم ماسا'}
      restaurantNameEn={setting?.nameEn || 'MASA Kitchen'}
      isBranchRestricted={isBranchRestricted}
      userBranchId={userBranchId}
    />
  );
}
