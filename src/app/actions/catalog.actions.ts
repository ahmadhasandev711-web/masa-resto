'use server';

import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/shared/errors/domain-error';
import { SessionService } from '../../infrastructure/auth/session.service';
import { prisma } from '../../infrastructure/db/prisma';
import { CategoryInput, ProductInput, ModifierGroupInput, BranchAvailabilityInput } from '../../application/catalog/dto/catalog.dto';
import { SaveCategoryUseCase } from '../../application/catalog/use-cases/save-category.use-case';
import { SaveProductUseCase } from '../../application/catalog/use-cases/save-product.use-case';
import { SaveModifierGroupUseCase } from '../../application/catalog/use-cases/save-modifier-group.use-case';
import { SetBranchAvailabilityUseCase } from '../../application/catalog/use-cases/set-branch-availability.use-case';
import { SetCatalogStatusUseCase } from '../../application/catalog/use-cases/set-catalog-status.use-case';
import { CatalogResource } from '../../domain/catalog/enums/catalog-resource.enum';
import { ActionResult, toActionFailure } from './action-result';
import { assertDemoAllows } from '../../infrastructure/demo/demo-policy';

export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult<{ id: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    const result = await new SaveCategoryUseCase().execute(input);
    revalidatePath('/admin/menu');
    return { success: true, data: { id: result.id } };
  } catch (error) { return toActionFailure(error); }
}

export async function saveProductAction(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    const result = await new SaveProductUseCase().execute(input);
    revalidatePath('/admin/menu');
    revalidatePath('/');
    return { success: true, data: { id: result.id } };
  } catch (error) { return toActionFailure(error); }
}

export async function saveModifierGroupAction(input: ModifierGroupInput): Promise<ActionResult<{ id: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    const result = await new SaveModifierGroupUseCase().execute(input);
    revalidatePath('/admin/menu');
    return { success: true, data: { id: result.id } };
  } catch (error) { return toActionFailure(error); }
}

export async function setBranchAvailabilityAction(input: BranchAvailabilityInput): Promise<ActionResult<{ isAvailable: boolean }>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    if (!session.isSuperAdmin && !session.assignedBranchIds.includes(input.branchId)) {
      throw new ForbiddenError('لا تملك صلاحية إدارة توفر الأصناف في هذا الفرع');
    }
    const result = await new SetBranchAvailabilityUseCase().execute(input);
    revalidatePath('/admin/menu');
    return { success: true, data: { isAvailable: result.isAvailable } };
  } catch (error) { return toActionFailure(error); }
}

export async function setCatalogStatusAction(input: { resource: CatalogResource; id: string; isActive: boolean }): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    const result = await new SetCatalogStatusUseCase().execute(input);
    revalidatePath('/admin/menu');
    return { success: true, data: { isActive: result.isActive } };
  } catch (error) { return toActionFailure(error); }
}

export async function toggleProductFeaturedAction(productId: string): Promise<ActionResult<{ isFeatured: boolean }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundError('الصنف غير موجود');
    }
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isFeatured: !product.isFeatured },
    });
    revalidatePath('/admin/menu');
    revalidatePath('/');
    return { success: true, data: { isFeatured: updated.isFeatured } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function uploadProductImageAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_MENU);
    const file = formData.get('file');
    if (!file || typeof file === 'string' || !(file instanceof Blob)) {
      throw new ValidationError('يرجى اختيار ملف صورة صالح');
    }

    const allowedMimeTypes: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
    };

    const fileType = file.type?.toLowerCase();
    if (!fileType || !allowedMimeTypes[fileType]) {
      throw new ValidationError('صيغة الملف غير مدعومة. الصيغ المسموحة: JPEG, PNG, WEBP, AVIF');
    }

    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSizeBytes) {
      throw new ValidationError('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت');
    }

    const ext = allowedMimeTypes[fileType];
    const fileName = `prod_${crypto.randomUUID()}_${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(path.join(uploadDir, fileName), buffer);

    return { success: true, data: { url: `/uploads/products/${fileName}` } };
  } catch (error) {
    return toActionFailure(error);
  }
}

