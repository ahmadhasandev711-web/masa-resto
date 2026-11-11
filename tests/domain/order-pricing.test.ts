import { describe, it, expect } from 'vitest';
import { OrderPricingService } from '../../src/domain/ordering/services/order-pricing.service';
import { Money } from '../../src/domain/shared/value-objects/money';
import { ValidationError } from '../../src/domain/shared/errors/domain-error';

describe('OrderPricingService', () => {
  const deliveryFee = Money.fromMinor(2000, 'EGP'); // 20.00 EGP

  it('calculates pricing for single item with no modifiers and zero tax', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(12000, 'EGP'), // 120.00 EGP
        quantity: 2,
      },
    ];

    const result = OrderPricingService.calculate(items, deliveryFee, 0);

    expect(result.subtotal.amount).toBe(24000); // 240.00 EGP
    expect(result.deliveryFee.amount).toBe(2000); // 20.00 EGP
    expect(result.tax.amount).toBe(0);
    expect(result.discount.amount).toBe(0);
    expect(result.total.amount).toBe(26000); // 260.00 EGP
  });

  it('calculates pricing with modifier deltas', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(15000, 'EGP'), // 150.00
        quantity: 2,
        modifierDeltas: [
          Money.fromMinor(2500, 'EGP'), // +25.00 extra cheese
          Money.fromMinor(1500, 'EGP'), // +15.00 extra sauce
        ],
      },
    ];

    // unit total = 15000 + 2500 + 1500 = 19000 * 2 = 38000
    const result = OrderPricingService.calculate(items, deliveryFee, 0);

    expect(result.subtotal.amount).toBe(38000);
    expect(result.total.amount).toBe(40000); // 38000 + 2000 delivery
  });

  it('calculates VAT tax correctly with rounding', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(10000, 'EGP'), // 100.00
        quantity: 1,
      },
    ];

    // 14% of 10000 = 1400
    const result = OrderPricingService.calculate(items, deliveryFee, 14);

    expect(result.subtotal.amount).toBe(10000);
    expect(result.tax.amount).toBe(1400);
    expect(result.deliveryFee.amount).toBe(2000);
    expect(result.total.amount).toBe(13400); // 10000 + 2000 + 1400
  });

  it('applies discount correctly without exceeding total', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(10000, 'EGP'),
        quantity: 1,
      },
    ];
    const discount = Money.fromMinor(3000, 'EGP'); // 30.00 EGP

    const result = OrderPricingService.calculate(items, deliveryFee, 0, discount);

    expect(result.subtotal.amount).toBe(10000);
    expect(result.discount.amount).toBe(3000);
    expect(result.total.amount).toBe(9000); // 10000 + 2000 - 3000 = 9000
  });

  it('caps total at zero when discount exceeds order total', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(1000, 'EGP'),
        quantity: 1,
      },
    ];
    const discount = Money.fromMinor(50000, 'EGP'); // huge discount

    const result = OrderPricingService.calculate(items, deliveryFee, 0, discount);

    expect(result.total.amount).toBe(0);
  });

  it('throws ValidationError when items list is empty', () => {
    expect(() => {
      OrderPricingService.calculate([], deliveryFee);
    }).toThrow(ValidationError);
  });

  it('throws ValidationError when item quantity is 0 or negative', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(5000, 'EGP'),
        quantity: 0,
      },
    ];

    expect(() => {
      OrderPricingService.calculate(items, deliveryFee);
    }).toThrow(ValidationError);
  });

  it('throws ValidationError if item currency does not match delivery fee currency', () => {
    const items = [
      {
        unitPrice: Money.fromMinor(5000, 'USD'),
        quantity: 1,
      },
    ];

    expect(() => {
      OrderPricingService.calculate(items, deliveryFee);
    }).toThrow(ValidationError);
  });
});