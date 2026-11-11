/**
 * Allowed values for every status column converted to a Prisma enum in phase E.
 * A migration must refuse to convert a column when any stored value is outside this list.
 */
export const STATUS_ENUM_VALUES = {
  'orders.status': ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'],
  'orders.payment_status': ['PENDING', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REFUNDED'],
  'orders.source': ['ONLINE', 'POS'],
  'orders.type': ['DELIVERY', 'DINE_IN', 'TAKEAWAY'],
  'orders.payment_method': ['CASH', 'CARD', 'ONLINE', 'MIXED'],
  'dining_tables.status': ['AVAILABLE', 'OCCUPIED', 'BILL_PRINTED', 'RESERVED', 'CLEANING'],
  'delivery_drivers.status': ['AVAILABLE', 'ON_DELIVERY', 'INACTIVE'],
  'event_bookings.status': ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  'cash_shifts.status': ['OPEN', 'CLOSED', 'AUDITED'],
  'purchase_orders.status': ['DRAFT', 'RECEIVED', 'CANCELLED'],
  'inventory_movements.type': ['SALE_POS', 'SALE_ONLINE', 'PURCHASE', 'OPERATIONAL_CONSUMPTION', 'WASTE', 'ADJUSTMENT'],
  'cash_shift_movements.type': ['CASH_IN', 'CASH_DROP', 'CASH_REFUND'],
  'offline_sale_reviews.status': ['PENDING', 'APPROVED', 'REJECTED'],
} as const;

export type StatusColumn = keyof typeof STATUS_ENUM_VALUES;

export function findInvalidStatusValues(column: StatusColumn, values: string[]): string[] {
  const allowed = new Set<string>(STATUS_ENUM_VALUES[column]);
  return [...new Set(values.filter((value) => !allowed.has(value)))];
}

export function assertStatusesConvertible(snapshot: Partial<Record<StatusColumn, string[]>>): void {
  const problems: string[] = [];
  for (const column of Object.keys(STATUS_ENUM_VALUES) as StatusColumn[]) {
    const invalid = findInvalidStatusValues(column, snapshot[column] ?? []);
    if (invalid.length > 0) {
      problems.push(`${column}: ${invalid.join(', ')}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Refusing enum conversion. Unknown values: ${problems.join(' | ')}`);
  }
}