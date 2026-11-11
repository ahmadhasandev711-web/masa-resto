import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/shared/value-objects/money';
import { PosSaleService } from '../../src/domain/pos/services/pos-sale.service';
import { PosSettlementService } from '../../src/domain/pos/services/pos-settlement.service';
import { PosPaymentMode } from '../../src/domain/pos/enums';
import { PosProduct, PosSettings } from '../../src/domain/pos/contracts/pos.repository';

const settings: PosSettings = { nameAr: 'اختبار', nameEn: 'Test', currency: 'EGP', locale: 'ar-EG', taxRatePercent: '14' };
const product: PosProduct = { id: 'product', categoryId: 'category', nameAr: 'صنف', nameEn: 'Item',
  sizes: [{ id: 'size', nameAr: 'عادي', nameEn: 'Regular', price: 10000 }],
  modifierGroups: [{ id: 'group', nameAr: 'إضافة مطلوبة', minSelect: 1, maxSelect: 1,
    modifiers: [{ id: 'modifier', nameAr: 'جبنة', nameEn: 'Cheese', priceDelta: 500 }] }] };
const selection = { productId: 'product', sizeId: 'size', modifierIds: ['modifier'], quantity: 2 };

describe('POS financial and selection rules', () => {
  it('parses decimal and Arabic input into exact minor units', () => {
    expect(Money.fromDecimal('١٢٣٫٤٥', 'EGP').amount).toBe(12345);
    expect(Money.fromDecimal('0.29', 'EGP').amount).toBe(29);
    expect(() => Money.fromDecimal('1.234', 'EGP')).toThrow();
    expect(() => Money.fromDecimal('Infinity', 'EGP')).toThrow();
    expect(() => Money.fromMinor(Number.MAX_SAFE_INTEGER + 1, 'EGP')).toThrow();
  });
  it('prices modifiers, quantity, VAT and discount consistently', () => {
    const line = PosSaleService.resolveLine(selection, [product], 'EGP');
    expect(PosSaleService.price([line], settings, 1000)).toEqual({ subtotalMinor: 21000, taxMinor: 2940, discountMinor: 1000, totalMinor: 22940 });
  });
  it('rejects missing required modifiers and foreign sizes', () => {
    expect(() => PosSaleService.resolveLine({ ...selection, modifierIds: [] }, [product], 'EGP')).toThrow();
    expect(() => PosSaleService.resolveLine({ ...selection, sizeId: 'foreign' }, [product], 'EGP')).toThrow();
  });
  it('rejects unknown modifiers and excessive selection', () => {
    expect(() => PosSaleService.resolveLine({ ...selection, modifierIds: ['unknown'] }, [product], 'EGP')).toThrow();
    expect(() => PosSaleService.resolveLine({ ...selection, modifierIds: ['modifier', 'modifier'] }, [product], 'EGP')).toThrow();
  });
  it('rejects an over-total discount', () => {
    const line = PosSaleService.resolveLine(selection, [product], 'EGP');
    expect(() => PosSaleService.price([line], settings, 100000)).toThrow();
  });
  it('records net cash rather than tendered cash and returns exact change', () => {
    const result = PosSettlementService.payments(PosPaymentMode.CASH, Money.fromMinor(11400, 'EGP'), Money.fromMinor(20000, 'EGP'));
    expect(result.payments[0].amountMinor).toBe(11400);
    expect(result.change.amount).toBe(8600);
  });
  it('splits cash and card without losing a minor unit', () => {
    const result = PosSettlementService.payments(PosPaymentMode.MIXED, Money.fromMinor(10001, 'EGP'), Money.fromMinor(3333, 'EGP'));
    expect(result.payments.map((payment) => payment.amountMinor)).toEqual([3333, 6668]);
  });
  it('rejects underpayment and invalid mixed split', () => {
    const total = Money.fromMinor(10000, 'EGP');
    expect(() => PosSettlementService.payments(PosPaymentMode.CASH, total, Money.fromMinor(9999, 'EGP'))).toThrow();
    expect(() => PosSettlementService.payments(PosPaymentMode.MIXED, total, total)).toThrow();
  });
});
