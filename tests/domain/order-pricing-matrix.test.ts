import { describe, it, expect } from 'vitest';
import { OrderPricingService } from '../../src/domain/ordering/services/order-pricing.service';
import { Money } from '../../src/domain/shared/value-objects/money';

describe('OrderPricingService 8-Scenario Matrix & Rounding (C6 / H2)', () => {
  const currency = 'EGP';
  const deliveryFee = Money.fromMinor(1500, currency); // 15.00 EGP
  const zeroDelivery = Money.zero(currency);
  const items = [{ unitPrice: Money.fromMinor(10000, currency), quantity: 1 }]; // 100.00 EGP
  const discount = Money.fromMinor(2000, currency); // 20.00 EGP

  // 1. Exclusive, No Discount, No Service
  it('Case 1: Exclusive, No Discount, No Service', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee,
      taxRatePercent: 14,
      serviceChargePercent: 0,
      pricesIncludeTax: false,
      isDineIn: false,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(0);
    expect(res.service.amount).toBe(0);
    expect(res.tax.amount).toBe(1400); // 10000 * 14%
    expect(res.total.amount).toBe(12900); // 10000 + 1400 + 1500
  });

  // 2. Exclusive, With Discount, No Service
  it('Case 2: Exclusive, With Discount, No Service', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee,
      taxRatePercent: 14,
      discount,
      serviceChargePercent: 0,
      pricesIncludeTax: false,
      isDineIn: false,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(2000);
    expect(res.service.amount).toBe(0);
    expect(res.tax.amount).toBe(1120); // (10000 - 2000) * 14% = 8000 * 14%
    expect(res.total.amount).toBe(10620); // 8000 + 1120 + 1500
  });

  // 3. Exclusive, No Discount, With Service (12% DINE_IN)
  it('Case 3: Exclusive, No Discount, With Service (12% DINE_IN)', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee: zeroDelivery,
      taxRatePercent: 14,
      serviceChargePercent: 12,
      pricesIncludeTax: false,
      isDineIn: true,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(0);
    expect(res.service.amount).toBe(1200); // 10000 * 12%
    expect(res.tax.amount).toBe(1568); // (10000 + 1200) * 14% = 11200 * 14%
    expect(res.total.amount).toBe(12768); // 10000 + 1200 + 1568
  });

  // 4. Exclusive, With Discount, With Service (12% DINE_IN)
  it('Case 4: Exclusive, With Discount, With Service (12% DINE_IN)', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee: zeroDelivery,
      taxRatePercent: 14,
      discount,
      serviceChargePercent: 12,
      pricesIncludeTax: false,
      isDineIn: true,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(2000);
    expect(res.service.amount).toBe(960); // (10000 - 2000) * 12% = 8000 * 12%
    expect(res.tax.amount).toBe(1254); // round((8000 + 960) * 14%) = round(1254.4) = 1254
    expect(res.total.amount).toBe(10214); // 8000 + 960 + 1254
  });

  // 5. Inclusive, No Discount, No Service
  it('Case 5: Inclusive, No Discount, No Service', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee,
      taxRatePercent: 14,
      serviceChargePercent: 0,
      pricesIncludeTax: true,
      isDineIn: false,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(0);
    expect(res.service.amount).toBe(0);
    expect(res.tax.amount).toBe(1228); // round(10000 * 14 / 114) = 1228
    expect(res.total.amount).toBe(11500); // 10000 + 1500
  });

  // 6. Inclusive, With Discount, No Service
  it('Case 6: Inclusive, With Discount, No Service', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee,
      taxRatePercent: 14,
      discount,
      serviceChargePercent: 0,
      pricesIncludeTax: true,
      isDineIn: false,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(2000);
    expect(res.service.amount).toBe(0);
    expect(res.tax.amount).toBe(982); // round(8000 * 14 / 114) = 982
    expect(res.total.amount).toBe(9500); // 8000 + 1500
  });

  // 7. Inclusive, No Discount, With Service (12% DINE_IN)
  it('Case 7: Inclusive, No Discount, With Service (12% DINE_IN)', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee: zeroDelivery,
      taxRatePercent: 14,
      serviceChargePercent: 12,
      pricesIncludeTax: true,
      isDineIn: true,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(0);
    expect(res.service.amount).toBe(1200); // 10000 * 12%
    expect(res.tax.amount).toBe(1375); // round((10000 + 1200) * 14 / 114) = 1375
    expect(res.total.amount).toBe(11200); // 10000 + 1200
  });

  // 8. Inclusive, With Discount, With Service (12% DINE_IN)
  it('Case 8: Inclusive, With Discount, With Service (12% DINE_IN)', () => {
    const res = OrderPricingService.calculateDetailed({
      items,
      deliveryFee: zeroDelivery,
      taxRatePercent: 14,
      discount,
      serviceChargePercent: 12,
      pricesIncludeTax: true,
      isDineIn: true,
    });

    expect(res.subtotal.amount).toBe(10000);
    expect(res.discount.amount).toBe(2000);
    expect(res.service.amount).toBe(960); // 8000 * 12%
    expect(res.tax.amount).toBe(1100); // round((8000 + 960) * 14 / 114) = 1100
    expect(res.total.amount).toBe(8960); // 8000 + 960
  });

  // 9. Rounding edge case
  it('Case 9: Correct integer rounding for fractional pennies', () => {
    const fractionalItems = [{ unitPrice: Money.fromMinor(3333, currency), quantity: 1 }];
    const res = OrderPricingService.calculateDetailed({
      items: fractionalItems,
      deliveryFee: zeroDelivery,
      taxRatePercent: 14,
      pricesIncludeTax: false,
    });

    // 3333 * 0.14 = 466.62 -> rounds to 467
    expect(res.tax.amount).toBe(467);
    expect(res.total.amount).toBe(3800);
  });
});
