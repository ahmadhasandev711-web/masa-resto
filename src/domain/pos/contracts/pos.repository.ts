import { OrderType, PaymentMethod } from '../../ordering/enums';

export interface PosSettings {
  nameAr: string;
  nameEn: string;
  currency: string;
  locale: string;
  taxRatePercent: string;
  pricesIncludeTax?: boolean;
  serviceChargePercent?: string;
  maxCashierDiscountPercent?: string;
}
export interface PosSize { id: string; nameAr: string; nameEn: string; price: number }
export interface PosModifier { id: string; nameAr: string; nameEn: string; priceDelta: number }
export interface PosModifierGroup { id: string; nameAr: string; minSelect: number; maxSelect: number; modifiers: PosModifier[] }
export interface PosProduct {
  id: string; categoryId: string; nameAr: string; nameEn: string;
  sizes: PosSize[]; modifierGroups: PosModifierGroup[];
}
export interface PosCategory { id: string; nameAr: string; products: PosProduct[] }
export interface PosScope { branchId: string; cashierId: string; canDiscount: boolean }
export interface PosSelection { productId: string; sizeId: string; modifierIds: string[]; quantity: number }
export interface PosPayment { method: PaymentMethod.CASH | PaymentMethod.CARD; amountMinor: number }
export interface PosRequest {
  branchId: string; cashShiftId: string; idempotencyKey: string; type: OrderType.DINE_IN | OrderType.TAKEAWAY;
  customerName?: string; customerNotes?: string; discountMinor: number; items: PosSelection[]; payments: PosPayment[];
}
export interface PosTotals { subtotalMinor: number; taxMinor: number; serviceMinor: number; discountMinor: number; totalMinor: number }
export interface PosResolvedLine {
  productId: string; sizeId: string; productNameAr: string; productNameEn: string;
  sizeNameAr: string; sizeNameEn: string; unitPriceMinor: number; quantity: number; totalPriceMinor: number;
  modifiers: { modifierId: string; nameAr: string; nameEn: string; priceDeltaMinor: number }[];
}
export interface PosReceipt extends PosTotals {
  id: string; orderNumber: string; branchId: string; branchName: string; cashierId: string; cashShiftId: string;
  idempotencyKey: string; type: string; customerName: string | null; customerNotes: string | null;
  createdAt: string; currency: string; locale: string; items: PosResolvedLine[]; payments: PosPayment[];
}
export interface PosShift { id: string; branchId: string; cashierId?: string; currency: string; openingCashMinor: number; openedAt: string }
export interface PosShiftClose { expectedCashMinor: number; closingCashMinor: number; varianceMinor: number }
export interface PosTransaction {
  lockShift(id: string, scope: PosScope): Promise<void>;
  findReplay(key: string): Promise<PosReceipt | null>;
  getSettings(): Promise<PosSettings>;
  getProducts(branchId: string, ids: string[]): Promise<PosProduct[]>;
  saveSale(request: PosRequest, scope: PosScope, settings: PosSettings, totals: PosTotals, lines: PosResolvedLine[]): Promise<PosReceipt>;
}
export interface PosRepository {
  transaction<T>(work: (transaction: PosTransaction) => Promise<T>): Promise<T>;
  openShift(branchId: string, cashierId: string, openingCashMinor: number): Promise<PosShift>;
  closeShift(branchId: string, cashierId: string, shiftId: string, closingCashMinor: number, clientPendingCount?: number): Promise<PosShiftClose>;
  getActiveShift(cashierId: string): Promise<PosShift | null>;
  getCatalog(branchId: string): Promise<PosCategory[]>;
  getSettings(): Promise<PosSettings>;
  recentReceipts(scope: PosScope): Promise<PosReceipt[]>;
}
