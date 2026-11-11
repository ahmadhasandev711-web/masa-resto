import { z } from 'zod';

export const placeOnlineOrderItemSchema = z.object({
  productId: z.string().uuid('معرف الصنف غير صالح'),
  sizeId: z.string().uuid('معرف المقاس غير صالح'),
  modifierIds: z.array(z.string().uuid()).default([]),
  quantity: z.number().int().min(1, 'الكمية يجب أن تكون 1 على الأقل'),
});

export const placeOnlineOrderSchema = z.object({
  customerName: z.string().min(2, 'اسم العميل يجب ألا يقل عن حرفين'),
  customerPhone: z.string().min(5, 'رقم الهاتف مطلوب'),
  customerEmail: z.string().email().nullable().optional().or(z.literal('')),
  area: z.string().min(1, 'المنطقة أو الحي مطلوب'),
  street: z.string().min(1, 'اسم الشارع مطلوب'),
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  apartment: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  deliveryNotes: z.string().nullable().optional(),
  customerNotes: z.string().nullable().optional(),
  idempotencyKey: z.string().uuid().optional(),
  branchId: z.string().uuid().optional().nullable(),
  items: z.array(placeOnlineOrderItemSchema).min(1, 'يجب اختيار صنف واحد على الأقل في السلة'),
});

export type PlaceOnlineOrderItemDto = z.infer<typeof placeOnlineOrderItemSchema>;
export type PlaceOnlineOrderDto = z.infer<typeof placeOnlineOrderSchema>;

export const listOrdersQuerySchema = z.object({
  status: z.string().optional(),
  branchId: z.string().optional(),
  allowedBranchIds: z.array(z.string()).optional(),
  source: z.string().optional(),
  type: z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentMethod: z.string().optional(),
  cashierId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListOrdersQueryInput = z.input<typeof listOrdersQuerySchema>;
export type ListOrdersQueryDto = z.infer<typeof listOrdersQuerySchema>;

export const assignOrderBranchSchema = z.object({
  orderId: z.string().uuid('معرف الطلب غير صالح'),
  branchId: z.string().uuid('معرف الفرع غير صالح'),
});

export type AssignOrderBranchDto = z.infer<typeof assignOrderBranchSchema>;

export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid('معرف الطلب غير صالح'),
  nextStatus: z.string().min(1, 'الحالة التالية مطلوبة'),
  cancelReason: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
});

export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;

