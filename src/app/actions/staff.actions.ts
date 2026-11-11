'use server';

import { revalidatePath } from 'next/cache';
import { CreateStaffUseCase } from '../../application/staff/use-cases/create-staff.use-case';
import { UpdateStaffUseCase } from '../../application/staff/use-cases/update-staff.use-case';
import { ResetStaffPasswordUseCase } from '../../application/staff/use-cases/reset-staff-password.use-case';
import { ToggleStaffStatusUseCase } from '../../application/staff/use-cases/toggle-staff-status.use-case';
import { CreateStaffDto, UpdateStaffDto, ResetStaffPasswordDto } from '../../application/staff/dto/staff.dto';
import { ActionResult, toActionFailure } from './action-result';
import { SessionService } from '../../infrastructure/auth/session.service';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { assertDemoAllows } from '../../infrastructure/demo/demo-policy';

export async function createStaffAction(formData: CreateStaffDto): Promise<ActionResult<{ id: string; username: string }>> {
  try {
    assertDemoAllows('staff');
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_STAFF);
    const useCase = new CreateStaffUseCase();
    const staff = await useCase.execute(formData, session);
    revalidatePath('/admin/staff');
    return { success: true, data: { id: staff.id, username: staff.username } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateStaffAction(formData: UpdateStaffDto): Promise<ActionResult<Awaited<ReturnType<UpdateStaffUseCase['execute']>>>> {
  try {
    assertDemoAllows('staff');
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_STAFF);
    const useCase = new UpdateStaffUseCase();
    const updated = await useCase.execute(formData, session);
    revalidatePath('/admin/staff');
    return { success: true, data: updated };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function resetStaffPasswordAction(formData: ResetStaffPasswordDto): Promise<ActionResult<{ id: string; username: string }>> {
  try {
    assertDemoAllows('staff');
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_STAFF);
    const useCase = new ResetStaffPasswordUseCase();
    const res = await useCase.execute(formData, session);
    revalidatePath('/admin/staff');
    return { success: true, data: res };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function toggleStaffStatusAction(userId: string, isActive: boolean): Promise<ActionResult<{ id: string; username: string; isActive: boolean }>> {
  try {
    assertDemoAllows('staff');
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_STAFF);
    const useCase = new ToggleStaffStatusUseCase();
    const res = await useCase.execute(userId, isActive, session);
    revalidatePath('/admin/staff');
    return { success: true, data: res };
  } catch (error) {
    return toActionFailure(error);
  }
}
