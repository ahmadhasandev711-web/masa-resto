import { Money } from '../../shared/value-objects/money';
import { ConflictError, ForbiddenError, ValidationError } from '../../shared/errors/domain-error';
import { OrderPricingService } from '../../ordering/services/order-pricing.service';
import { OrderType } from '../../ordering/enums';
import { PosProduct, PosReceipt, PosRequest, PosResolvedLine, PosScope, PosSelection, PosSettings, PosTotals } from '../contracts/pos.repository';

export class PosSaleService {
  public static resolveLine(input: PosSelection, products: PosProduct[], currency: string): PosResolvedLine {
    const product = products.find((candidate) => candidate.id === input.productId);
    const size = product?.sizes.find((candidate) => candidate.id === input.sizeId);
    if (!product || !size) throw new ValidationError('الصنف أو المقاس غير متاح في هذا الفرع');
    const modifiers = product.modifierGroups.flatMap((group) => group.modifiers).filter((modifier) => input.modifierIds.includes(modifier.id));
    if (modifiers.length !== input.modifierIds.length) throw new ValidationError('إضافة غير متاحة أو غير مرتبطة بالصنف');
    for (const group of product.modifierGroups) {
      const count = group.modifiers.filter((modifier) => input.modifierIds.includes(modifier.id)).length;
      if (count < group.minSelect || count > group.maxSelect) throw new ValidationError('اختيارات ' + group.nameAr + ' لا تطابق الحدود المسموحة');
    }
    const unitPrice = modifiers.reduce((sum, modifier) => sum.add(Money.fromMinor(modifier.priceDelta, currency)), Money.fromMinor(size.price, currency));
    return { productId: product.id, sizeId: size.id, productNameAr: product.nameAr, productNameEn: product.nameEn,
      sizeNameAr: size.nameAr, sizeNameEn: size.nameEn, unitPriceMinor: size.price, quantity: input.quantity,
      totalPriceMinor: unitPrice.multiply(input.quantity).amount,
      modifiers: modifiers.map((modifier) => ({ modifierId: modifier.id, nameAr: modifier.nameAr, nameEn: modifier.nameEn, priceDeltaMinor: modifier.priceDelta })) };
  }

  public static price(
    lines: PosResolvedLine[],
    settings: PosSettings,
    discountMinor: number,
    orderType: OrderType = OrderType.TAKEAWAY
  ): PosTotals {
    const currency = settings.currency;
    const items = lines.map((line) => ({
      unitPrice: Money.fromMinor(line.unitPriceMinor, currency),
      quantity: line.quantity,
      modifierDeltas: line.modifiers.map((modifier) => Money.fromMinor(modifier.priceDeltaMinor, currency)),
    }));

    const isDineIn = orderType === OrderType.DINE_IN;
    const taxRatePercent = Number(settings.taxRatePercent ?? 14);
    const serviceChargePercent = Number(settings.serviceChargePercent ?? 0);
    const pricesIncludeTax = Boolean(settings.pricesIncludeTax);

    const subtotalMinor = items.reduce((sum, item) => {
      const itemUnit = item.modifierDeltas.reduce((acc, d) => acc + d.amount, item.unitPrice.amount);
      return sum + itemUnit * item.quantity;
    }, 0);

    if (discountMinor >= subtotalMinor) {
      throw new ValidationError('الخصم يجب أن يقل عن إجمالي الفاتورة');
    }

    if (discountMinor > 0 && settings.maxCashierDiscountPercent !== undefined) {
      const maxDiscountMinor = Math.round((subtotalMinor * Number(settings.maxCashierDiscountPercent)) / 100);
      if (discountMinor > maxDiscountMinor) {
        throw new ValidationError(`نسبة الخصم تتجاوز الحد الأقصى المسموح (${settings.maxCashierDiscountPercent}%)`);
      }
    }

    const calculated = OrderPricingService.calculateDetailed({
      items,
      deliveryFee: Money.zero(currency),
      taxRatePercent,
      discount: Money.fromMinor(discountMinor, currency),
      isDineIn,
      serviceChargePercent,
      pricesIncludeTax,
    });

    if (calculated.total.amount > 2147483647) throw new ValidationError('إجمالي الطلب تجاوز الحد المالي المسموح');

    return {
      subtotalMinor: calculated.subtotal.amount,
      taxMinor: calculated.tax.amount,
      serviceMinor: calculated.service.amount,
      discountMinor: calculated.discount.amount,
      totalMinor: calculated.total.amount,
    };
  }

  public static assertPayments(request: PosRequest, totals: PosTotals, currency: string): void {
    const paid = request.payments.reduce((sum, payment) => sum.add(Money.fromMinor(payment.amountMinor, currency)), Money.zero(currency));
    if (new Set(request.payments.map((payment) => payment.method)).size !== request.payments.length) throw new ValidationError('طريقة الدفع مكررة');
    if (paid.amount !== totals.totalMinor) throw new ValidationError('مجموع الدفعات يجب أن يساوي الإجمالي شاملاً الضريبة');
  }

  public static assertReplay(receipt: PosReceipt, request: PosRequest, scope: PosScope): void {
    if (receipt.cashierId !== scope.cashierId || receipt.branchId !== scope.branchId) throw new ForbiddenError();
    const previous = { ...request, customerName: receipt.customerName ?? undefined, customerNotes: receipt.customerNotes ?? undefined,
      cashShiftId: receipt.cashShiftId, type: receipt.type, discountMinor: receipt.discountMinor,
      items: receipt.items.map((line) => ({ productId: line.productId, sizeId: line.sizeId, quantity: line.quantity, modifierIds: line.modifiers.map((modifier) => modifier.modifierId) })),
      payments: receipt.payments };
    if (this.signature(previous) !== this.signature(request)) throw new ConflictError('مفتاح العملية مستخدم لطلب مختلف');
  }

  private static signature(request: Omit<PosRequest, 'type'> & { type: string }): string {
    const items = request.items.map((item) => ({ productId: item.productId, sizeId: item.sizeId, quantity: item.quantity,
      modifierIds: item.modifierIds.slice().sort() })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const payments = request.payments.slice().sort((a, b) => a.method.localeCompare(b.method));
    return JSON.stringify({ type: request.type, shift: request.cashShiftId, discount: request.discountMinor,
      name: request.customerName, notes: request.customerNotes, items, payments });
  }
}
