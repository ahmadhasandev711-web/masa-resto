'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { CreateBranchUseCase } from '../../application/branches/use-cases/create-branch.use-case';
import { UpdateBranchUseCase } from '../../application/branches/use-cases/update-branch.use-case';
import { ToggleBranchStatusUseCase } from '../../application/branches/use-cases/toggle-branch-status.use-case';
import { CreateBranchDto, UpdateBranchDto } from '../../application/branches/dto/branch.dto';
import { ActionResult, toActionFailure } from './action-result';
import { env } from '../../infrastructure/config/env';
import { SessionService } from '../../infrastructure/auth/session.service';
import { BranchContextService } from '../../infrastructure/auth/branch-context.service';
import { UnauthorizedError } from '../../domain/shared/errors/domain-error';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { assertDemoAllows } from '../../infrastructure/demo/demo-policy';

export async function createBranchAction(formData: CreateBranchDto): Promise<ActionResult<Awaited<ReturnType<CreateBranchUseCase['execute']>>>> {
  try {
    assertDemoAllows('branch_create');
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const useCase = new CreateBranchUseCase();
    const branch = await useCase.execute(formData);
    revalidatePath('/admin/branches');
    return { success: true, data: branch };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateBranchAction(
  branchId: string,
  formData: UpdateBranchDto
): Promise<ActionResult<Awaited<ReturnType<UpdateBranchUseCase['execute']>>>> {
  try {
    assertDemoAllows('branch_update');
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const useCase = new UpdateBranchUseCase();
    const branch = await useCase.execute(branchId, formData);
    revalidatePath('/admin/branches');
    return { success: true, data: branch };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function toggleBranchStatusAction(branchId: string, isActive: boolean): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_BRANCHES);
    const useCase = new ToggleBranchStatusUseCase();
    const updated = await useCase.execute(branchId, isActive);
    revalidatePath('/admin/branches');
    return { success: true, data: { id: updated.id, isActive: updated.isActive } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function switchActiveBranchAction(branchId: string): Promise<ActionResult<{ activeBranchId: string }>> {
  try {
    const session = await SessionService.getCurrent();
    if (!session) {
      throw new UnauthorizedError('يجب تسجيل الدخول أولاً');
    }

    // Strict security check: Ensure the user actually has access to this branch
    await BranchContextService.assertBranchAccess(session, branchId);

    const cookieStore = await cookies();
    cookieStore.set('resto_active_branch_id', branchId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    revalidatePath('/admin');
    return { success: true, data: { activeBranchId: branchId } };
  } catch (error) {
    return toActionFailure(error);
  }
}
