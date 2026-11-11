import { Prisma } from '@prisma/client';
import { PosReceipt } from '../../domain/pos/contracts/pos.repository';
import { PaymentMethod } from '../../domain/ordering/enums';

export const posReceiptInclude = {
  branch: { select: { nameAr: true } },
  items: { include: { modifiers: true } },
  payments: true,
} satisfies Prisma.OrderInclude;

type ReceiptRecord = Prisma.OrderGetPayload<{ include: typeof posReceiptInclude }>;

export function mapPosReceipt(order: ReceiptRecord, currency: string, locale: string): PosReceipt {
  return { id: order.id, orderNumber: order.orderNumber, branchId: order.branchId!, branchName: order.branch?.nameAr ?? '',
    cashierId: order.cashierId!, cashShiftId: order.cashShiftId!, idempotencyKey: order.posIdempotencyKey!,
    type: order.type, customerName: order.customerName, customerNotes: order.customerNotes,
    createdAt: order.createdAt.toISOString(), currency: order.currency ?? currency, locale, subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor,
    serviceMinor: order.serviceMinor,
    discountMinor: order.discountMinor, totalMinor: order.totalMinor,
    items: order.items.map((item) => ({ productId: item.productId, sizeId: item.sizeId!, productNameAr: item.productNameAr,
      productNameEn: item.productNameEn, sizeNameAr: item.sizeNameAr ?? '', sizeNameEn: item.sizeNameEn ?? '',
      quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, totalPriceMinor: item.totalPriceMinor,
      modifiers: item.modifiers.map((modifier) => ({ modifierId: modifier.modifierId, nameAr: modifier.nameAr, nameEn: modifier.nameEn, priceDeltaMinor: modifier.priceDeltaMinor })) })),
    payments: order.payments.map((payment) => ({ method: payment.method as PaymentMethod.CASH | PaymentMethod.CARD, amountMinor: payment.amountMinor })) };
}
