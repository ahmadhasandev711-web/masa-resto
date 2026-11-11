import { Money } from '../../shared/value-objects/money';
import { ValidationError } from '../../shared/errors/domain-error';

export interface PricingItemInput {
  unitPrice: Money;
  quantity: number;
  modifierDeltas?: Money[];
}

export interface DetailedPricingOptions {
  items: PricingItemInput[];
  deliveryFee?: Money;
  taxRatePercent?: number;
  discount?: Money;
  serviceChargePercent?: number;
  pricesIncludeTax?: boolean;
  isDineIn?: boolean;
}

export interface PricingCalculationResult {
  subtotal: Money;
  deliveryFee: Money;
  service: Money;
  tax: Money;
  discount: Money;
  total: Money;
}

/**
 * Deterministic Server-Side Order Pricing Service (C6, H2, GR-3.2, GR-1.1, GR-8.2).
 * Guarantees arithmetic accuracy using integer minor units (Money VO).
 *
 * Sequence:
 * 1. subtotal = sum(unitPrice + modifiers) * quantity
 * 2. discountedBase = max(0, subtotal - discount)
 * 3. service = isDineIn ? round(discountedBase * serviceChargePercent / 100) : 0
 * 4. tax:
 *    - if exclusive (pricesIncludeTax = false): round((discountedBase + service) * taxRatePercent / 100)
 *    - if inclusive (pricesIncludeTax = true): round((discountedBase + service) * taxRatePercent / (100 + taxRatePercent))
 * 5. total:
 *    - if exclusive: discountedBase + service + tax + deliveryFee
 *    - if inclusive: discountedBase + service + deliveryFee
 */
export class OrderPricingService {
  public static calculateDetailed(options: DetailedPricingOptions): PricingCalculationResult {
    const {
      items,
      deliveryFee,
      taxRatePercent = 0,
      discount,
      serviceChargePercent = 0,
      pricesIncludeTax = false,
      isDineIn = false,
    } = options;

    if (!items || items.length === 0) {
      throw new ValidationError('لا يمكن حساب تسعير طلب فارغ بدون أصناف');
    }

    const currency = items[0].unitPrice.currency;
    const effectiveDeliveryFee = deliveryFee ?? Money.zero(currency);
    effectiveDeliveryFee.assertSameCurrency(items[0].unitPrice);

    let subtotal = Money.zero(currency);

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new ValidationError('كمية الصنف يجب أن تكون 1 على الأقل');
      }

      let itemUnitPrice = item.unitPrice;
      item.unitPrice.assertSameCurrency(effectiveDeliveryFee);

      if (item.modifierDeltas && item.modifierDeltas.length > 0) {
        for (const delta of item.modifierDeltas) {
          delta.assertSameCurrency(effectiveDeliveryFee);
          itemUnitPrice = itemUnitPrice.add(delta);
        }
      }

      const itemTotal = itemUnitPrice.multiply(item.quantity);
      subtotal = subtotal.add(itemTotal);
    }

    // 1. Discount
    const appliedDiscount = discount ? discount : Money.zero(currency);
    appliedDiscount.assertSameCurrency(effectiveDeliveryFee);
    const discountedBase = Math.max(0, subtotal.amount - appliedDiscount.amount);

    // 2. Service Charge (Dine-In only)
    let serviceMinor = 0;
    if (isDineIn && serviceChargePercent > 0 && discountedBase > 0) {
      serviceMinor = Math.round((discountedBase * serviceChargePercent) / 100);
    }
    const service = Money.fromMinor(serviceMinor, currency);

    // 3. Tax
    const taxableGross = discountedBase + serviceMinor;
    let taxMinor = 0;
    if (taxRatePercent > 0 && taxableGross > 0) {
      if (pricesIncludeTax) {
        // Extract tax included in prices: gross * rate / (100 + rate)
        taxMinor = Math.round((taxableGross * taxRatePercent) / (100 + taxRatePercent));
      } else {
        // Add tax on top of exclusive prices: gross * rate / 100
        taxMinor = Math.round((taxableGross * taxRatePercent) / 100);
      }
    }
    const tax = Money.fromMinor(taxMinor, currency);

    // 4. Total Calculation
    let totalMinor = 0;
    if (pricesIncludeTax) {
      totalMinor = discountedBase + serviceMinor + effectiveDeliveryFee.amount;
    } else {
      totalMinor = discountedBase + serviceMinor + taxMinor + effectiveDeliveryFee.amount;
    }

    // If discount exceeds subtotal, absorb remainder against order delivery fee (capped at 0)
    const excessDiscount = Math.max(0, appliedDiscount.amount - subtotal.amount);
    if (excessDiscount > 0) {
      totalMinor = Math.max(0, totalMinor - excessDiscount);
    }

    const total = Money.fromMinor(totalMinor, currency);

    return {
      subtotal,
      deliveryFee: effectiveDeliveryFee,
      service,
      tax,
      discount: appliedDiscount,
      total,
    };
  }

  /**
   * Legacy wrapper maintaining backwards compatibility.
   */
  public static calculate(
    items: PricingItemInput[],
    deliveryFee: Money,
    taxRatePercent: number = 0,
    discount?: Money
  ): PricingCalculationResult {
    return this.calculateDetailed({
      items,
      deliveryFee,
      taxRatePercent,
      discount,
      serviceChargePercent: 0,
      pricesIncludeTax: false,
      isDineIn: false,
    });
  }
}
