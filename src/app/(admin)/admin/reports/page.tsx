import { Metadata } from 'next';
import { prisma } from '../../../../infrastructure/db/prisma';
import { assertPagePermission } from '../../../../infrastructure/auth/page-guard';
import { BranchContextService } from '../../../../infrastructure/auth/branch-context.service';
import { PermissionCode } from '../../../../domain/staff/enums/permission.enum';
import { GetSalesAnalyticsUseCase } from '../../../../application/reports/use-cases/get-sales-analytics.use-case';
import { GetMenuEngineeringUseCase } from '../../../../application/reports/use-cases/get-menu-engineering.use-case';
import { GetBranchPerformanceUseCase } from '../../../../application/reports/use-cases/get-branch-performance.use-case';
import { GetInventoryAnalyticsUseCase } from '../../../../application/reports/use-cases/get-inventory-analytics.use-case';
import { ReportsClient } from './reports-client';

export const metadata: Metadata = {
  title: 'التقارير الإدارية والتحليلات الشاملة | منظومة المطعم',
  description: 'قمرة التحليلات التنفيذية للمبيعات، ربحية الأصناف، أداء الفروع، وحركة المخزون',
};

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await assertPagePermission(PermissionCode.VIEW_REPORTS);

  const scope = BranchContextService.resolveScope(session);
  const isBranchScoped = scope.allowedBranchIds !== 'ALL';
  const assignedBranches = scope.allowedBranchIds === 'ALL' ? null : scope.allowedBranchIds;
  const defaultBranchId = assignedBranches ? (assignedBranches[0] ?? undefined) : undefined;

  const [settings, branches] = await Promise.all([
    prisma.restaurantSetting.findFirst(),
    prisma.branch.findMany({
      where: {
        isActive: true,
        ...(assignedBranches ? { id: { in: assignedBranches } } : {}),
      },
      select: { id: true, code: true, nameAr: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Initial date range: Last 7 days
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  const salesUseCase = new GetSalesAnalyticsUseCase();
  const menuUseCase = new GetMenuEngineeringUseCase();
  const branchUseCase = new GetBranchPerformanceUseCase();
  const inventoryUseCase = new GetInventoryAnalyticsUseCase();

  const [initialSales, initialMenu, initialBranches, initialInventory] = await Promise.all([
    salesUseCase.execute({ branchId: defaultBranchId, startDate, endDate }),
    menuUseCase.execute({ branchId: defaultBranchId, startDate, endDate }),
    isBranchScoped
      ? Promise.resolve({ currency: settings?.currency || 'EGP', branches: [] })
      : branchUseCase.execute({ startDate, endDate }),
    inventoryUseCase.execute({ branchId: defaultBranchId, startDate, endDate }),
  ]);

  return (
    <ReportsClient
      currencySymbol={settings?.currencySymbol || 'ج.م'}
      currency={settings?.currency || 'EGP'}
      branches={branches}
      initialStartDateIso={startDate.toISOString()}
      initialEndDateIso={endDate.toISOString()}
      initialSales={initialSales}
      initialMenu={initialMenu}
      initialBranches={initialBranches}
      initialInventory={initialInventory}
      isBranchScoped={isBranchScoped}
      userBranchId={defaultBranchId}
    />
  );
}
