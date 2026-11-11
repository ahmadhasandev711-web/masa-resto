import { z } from 'zod';

const majorAmount = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'أدخل مبلغاً موجباً حتى خانتين عشريتين');

export const categorySchema = z.object({
  id: z.string().optional(),
  nameAr: z.string().trim().min(2, 'اسم التصنيف بالعربية مطلوب'),
  nameEn: z.string().trim().min(2, 'اسم التصنيف بالإنجليزية مطلوب'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});

export const productSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1, 'اختر تصنيفاً'),
  nameAr: z.string().trim().min(2, 'اسم الصنف بالعربية مطلوب'),
  nameEn: z.string().trim().min(2, 'اسم الصنف بالإنجليزية مطلوب'),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  imageUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  isFeatured: z.boolean().default(false),
  sizes: z.array(z.object({
    id: z.string().optional(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().min(1),
    price: majorAmount,
  })).min(1, 'أضف مقاساً واحداً على الأقل'),
  modifierGroupIds: z.array(z.string()).default([]),
});

export const modifierGroupSchema = z.object({
  id: z.string().optional(),
  nameAr: z.string().trim().min(2, 'اسم المجموعة بالعربية مطلوب'),
  nameEn: z.string().trim().min(2, 'اسم المجموعة بالإنجليزية مطلوب'),
  minSelect: z.number().int().min(0),
  maxSelect: z.number().int().min(1),
  modifiers: z.array(z.object({
    id: z.string().optional(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().min(1),
    price: majorAmount,
  })).min(1, 'أضف خياراً واحداً على الأقل'),
}).refine((value) => value.minSelect <= value.maxSelect, {
  message: 'الحد الأدنى لا يمكن أن يتجاوز الحد الأقصى',
  path: ['minSelect'],
});

export const branchAvailabilitySchema = z.object({
  branchId: z.string().min(1),
  productId: z.string().min(1),
  isAvailable: z.boolean(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;
export type BranchAvailabilityInput = z.infer<typeof branchAvailabilitySchema>;

export function toMinorUnits(amount: string): number {
  const [whole, fraction = ''] = amount.split('.');
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minorUnits)) throw new Error('المبلغ أكبر من النطاق المدعوم');
  return minorUnits;
}
