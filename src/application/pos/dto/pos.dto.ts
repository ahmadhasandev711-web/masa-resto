import { z } from 'zod';
import { OrderType, PaymentMethod } from '../../../domain/ordering/enums';

const paymentSchema = z.object({
  method: z.enum([PaymentMethod.CASH, PaymentMethod.CARD]),
  amountMinor: z.number().int().positive('قيمة الدفعة يجب أن تكون أكبر من صفر').max(2147483647),
});

const itemSchema = z.object({
  productId: z.string().uuid(),
  sizeId: z.string().uuid(),
  modifierIds: z.array(z.string().uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, 'الإضافات مكررة').default([]),
  quantity: z.number().int().min(1).max(99),
});

export const openCashShiftSchema = z.object({
  branchId: z.string().uuid(),
  openingCashMinor: z.number().int().min(0).max(2147483647),
});

export const closeCashShiftSchema = z.object({
  branchId: z.string().uuid(),
  cashShiftId: z.string().uuid(),
  closingCashMinor: z.number().int().min(0).max(2147483647),
  clientPendingCount: z.number().int().min(0).optional(),
});

export const createPosOrderSchema = z.object({
  branchId: z.string().uuid(),
  cashShiftId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  type: z.enum([OrderType.DINE_IN, OrderType.TAKEAWAY]),
  customerName: z.string().trim().min(2).max(120).optional(),
  customerNotes: z.string().trim().max(500).optional(),
  discountMinor: z.number().int().min(0).max(2147483647).default(0),
  offlineOrderNumber: z.string().trim().max(100).optional(),
  items: z.array(itemSchema).min(1).max(100),
  payments: z.array(paymentSchema).min(1).max(2),
}).superRefine((value, ctx) => {
  if (new Set(value.items.map((item) => `${item.productId}:${item.sizeId}:${item.modifierIds.slice().sort().join(',')}`)).size !== value.items.length) {
    ctx.addIssue({ code: 'custom', message: 'لا تكرر الصنف نفسه في السلة؛ عدّل كميته بدلاً من ذلك' });
  }
});

export type OpenCashShiftDto = z.infer<typeof openCashShiftSchema>;
export type CloseCashShiftDto = z.infer<typeof closeCashShiftSchema>;
export type CreatePosOrderDto = z.infer<typeof createPosOrderSchema>;
