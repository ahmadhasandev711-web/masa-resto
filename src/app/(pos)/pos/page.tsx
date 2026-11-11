import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SessionService } from '../../../infrastructure/auth/session.service';
import { PermissionCode } from '../../../domain/staff/enums/permission.enum';
import { BranchContextService } from '../../../infrastructure/auth/branch-context.service';
import { prisma } from '../../../infrastructure/db/prisma';
import { PrismaPosRepository } from '../../../infrastructure/pos/prisma-pos.repository';
import { RbacGuard } from '../../../infrastructure/auth/rbac-guard';
import { PosClient } from './pos-client';
import { GetPosCatalogUseCase } from '../../../application/pos/use-cases/get-pos-catalog.use-case';
import { GetActiveCashShiftUseCase } from '../../../application/pos/use-cases/cash-shift.use-cases';

import { ListTablesUseCase } from '../../../application/tables/use-cases/list-tables.use-case';

export default async function PosPage() {
  const session = await SessionService.getCurrent();
  if (!session) redirect('/login');
  if (!RbacGuard.hasPermission(session, PermissionCode.POS_ACCESS)) redirect('/admin');
  const repository = new PrismaPosRepository();
  const activeShift = await new GetActiveCashShiftUseCase(repository).execute(session.userId);
  const cookieBranchId = (await cookies()).get('resto_active_branch_id')?.value;
  const permittedCookieBranch = cookieBranchId && (session.isSuperAdmin || session.assignedBranchIds.includes(cookieBranchId)) ? cookieBranchId : undefined;
  const requestedBranchId = activeShift?.branchId ?? permittedCookieBranch;
  const branchId = await BranchContextService.assertBranchAccess(session, requestedBranchId);
  const scope = { branchId, cashierId: session.userId, canDiscount: RbacGuard.hasPermission(session, PermissionCode.APPLY_POS_DISCOUNT) };
  const [branch, settings, categories, receipts, tablesData] = await Promise.all([
    prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { id: true, nameAr: true, code: true } }),
    repository.getSettings(),
    new GetPosCatalogUseCase(repository).execute(branchId),
    repository.recentReceipts(scope),
    new ListTablesUseCase().execute(branchId),
  ]);
  return (
    <PosClient
      branch={branch}
      settings={settings}
      categories={categories}
      initialShift={activeShift}
      initialReceipts={receipts}
      canDiscount={scope.canDiscount}
      initialTables={tablesData.tables}
      initialSections={tablesData.sections}
      cashierId={session.userId}
    />
  );
}
