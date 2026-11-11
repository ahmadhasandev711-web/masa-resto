import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/shared/errors/domain-error';
import { assertReadyForDispatch } from '../../src/domain/delivery/services/dispatch-policy';
import { OrderStatus } from '../../src/domain/ordering/enums';
import { createTrackingToken } from '../../src/domain/ordering/services/tracking-token';
import {
  productOwnedRecipeFilter,
  productOwnedRecipeRows,
} from '../../src/domain/inventory/services/product-recipe-policy';
import { assertStatusesConvertible, findInvalidStatusValues } from '../../src/infrastructure/db/status-enum-guard';

describe('Phase E guards', () => {
  it('dispatches only from READY_FOR_PICKUP', () => {
    expect(() => assertReadyForDispatch('1001', OrderStatus.READY_FOR_PICKUP)).not.toThrow();
    expect(() => assertReadyForDispatch('1002', OrderStatus.PREPARING)).toThrow(ValidationError);
    expect(() => assertReadyForDispatch('1003', OrderStatus.CONFIRMED)).toThrow(/جاهزاً/);
  });

  it('keeps modifier recipes out of the product recipe replace', () => {
    const filter = productOwnedRecipeFilter('product-1', ['size-1']);
    expect(filter.modifierId).toBeNull();
    expect(filter.OR).toEqual([{ productId: 'product-1' }, { productSizeId: { in: ['size-1'] } }]);

    const rows = productOwnedRecipeRows('product-1', [
      { inventoryItemId: 'beans', productSizeId: 'size-1', quantity: 12 },
      { inventoryItemId: 'syrup', modifierId: 'mod-1', quantity: 5 },
    ]);
    expect(rows).toEqual([
      { inventoryItemId: 'beans', productId: null, productSizeId: 'size-1', modifierId: null, quantity: 12 },
    ]);
  });

  it('refuses enum conversion when a stored status is unknown', () => {
    expect(findInvalidStatusValues('orders.status', ['COMPLETED', 'PAID'])).toEqual(['PAID']);
    expect(() => assertStatusesConvertible({ 'orders.status': ['COMPLETED', 'PENDING'] })).not.toThrow();
    expect(() => assertStatusesConvertible({ 'cash_shift_movements.type': ['CASH_IN', 'TIP'] })).toThrow(/TIP/);
  });

  it('creates a 16-byte base64url tracking token', () => {
    const token = createTrackingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(16);
  });
});