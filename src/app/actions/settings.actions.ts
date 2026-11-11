'use server';

import { revalidatePath } from 'next/cache';
import { UpdateSettingsUseCase } from '../../application/settings/use-cases/update-settings.use-case';
import { UpdateSettingsDto } from '../../application/settings/dto/settings.dto';
import { ActionResult, toActionFailure } from './action-result';
import { SessionService } from '../../infrastructure/auth/session.service';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { assertDemoAllows } from '../../infrastructure/demo/demo-policy';

export type SettingsActionResultData = {
  id: string;
  nameAr: string;
  nameEn: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  taxRatePercent: number;
  deliveryFee: number;
  phone?: string | null;
  address?: string | null;
};

export async function updateSettingsAction(formData: UpdateSettingsDto): Promise<ActionResult<SettingsActionResultData>> {
  try {
    assertDemoAllows('settings');
    await SessionService.requirePermission(PermissionCode.MANAGE_SETTINGS);
    const useCase = new UpdateSettingsUseCase();
    const settings = await useCase.execute(formData);
    revalidatePath('/admin/settings');
    revalidatePath('/admin');

    return {
      success: true,
      data: {
        id: settings.id,
        nameAr: settings.nameAr,
        nameEn: settings.nameEn,
        currency: settings.currency,
        currencySymbol: settings.currencySymbol,
        locale: settings.locale,
        taxRatePercent: Number(settings.taxRatePercent),
        deliveryFee: settings.deliveryFee,
        phone: settings.phone,
        address: settings.address,
      },
    };
  } catch (error) {
    return toActionFailure(error);
  }
}
