import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/db/prisma';
import { PrismaPosRepository } from '../../src/infrastructure/pos/prisma-pos.repository';
import { CreatePosOrderUseCase } from '../../src/application/pos/use-cases/create-pos-order.use-case';
import { OpenCashShiftUseCase, CloseCashShiftUseCase } from '../../src/application/pos/use-cases/cash-shift.use-cases';
import { CreatePosOrderDto } from '../../src/application/pos/dto/pos.dto';
import { Money } from '../../src/domain/shared/value-objects/money';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/domain/shared/errors/domain-error';
import { BranchContextService } from '../../src/infrastructure/auth/branch-context.service';
import { OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '../../src/domain/ordering/enums';
import { GetOrderTrackerUseCase } from '../../src/application/ordering/use-cases/get-order-tracker.use-case';
import { ListOrdersUseCase } from '../../src/application/ordering/use-cases/list-orders.use-case';

const repository = new PrismaPosRepository();
const create = new CreatePosOrderUseCase(repository);
let branchId: string; let cashierId: string; let categoryId: string; let roleId: string; let productId: string; let sizeId: string; let shiftId: string; let totalMinor: number;
const code = 'POS-VERIFY-' + crypto.randomUUID();
const scope = () => ({ branchId, cashierId, canDiscount: false });
function request(): CreatePosOrderDto {
  return { branchId, cashShiftId: shiftId, idempotencyKey: crypto.randomUUID(), type: OrderType.TAKEAWAY, discountMinor: 0,
    items: [{ productId, sizeId, modifierIds: [], quantity: 1 }], payments: [{ method: PaymentMethod.CASH, amountMinor: totalMinor }] };
}
describe('POS audited transaction integration', () => {
  beforeAll(async () => {
    const settings = await repository.getSettings();
    totalMinor = Money.fromMinor(10000, settings.currency).add(Money.fromMinor(10000, settings.currency).percentage(settings.taxRatePercent)).amount;
    branchId = (await prisma.branch.create({ data: { code, nameAr: 'فرع اختبار POS', nameEn: code, phone: '01000000000', address: 'اختبار' } })).id;
    roleId = (await prisma.role.create({ data: { name: code } })).id;
    cashierId = (await prisma.user.create({ data: { username: code, fullName: 'كاشير اختبار', phone: '01000000000', passwordHash: 'not-an-authentication-fixture', roleId } })).id;
    categoryId = (await prisma.category.create({ data: { nameAr: code, nameEn: code } })).id;
    const product = await prisma.product.create({ data: { categoryId, nameAr: code, nameEn: code, sizes: { create: { nameAr: 'عادي', nameEn: 'Regular', price: 10000 } } }, include: { sizes: true } });
    productId = product.id; sizeId = product.sizes[0].id;
  });
  afterAll(async () => {
    if (branchId) { await prisma.order.deleteMany({ where: { branchId } }); await prisma.cashShift.deleteMany({ where: { branchId } }); }
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (cashierId) await prisma.user.delete({ where: { id: cashierId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (branchId) await prisma.branch.delete({ where: { id: branchId } });
  });
  it('serializes concurrent opening so one cashier has only one open shift', async () => {
    const open = new OpenCashShiftUseCase(repository);
    const outcomes = await Promise.allSettled([open.execute({ branchId, openingCashMinor: 2000 }, cashierId), open.execute({ branchId, openingCashMinor: 2000 }, cashierId)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const shift = await repository.getActiveShift(cashierId); shiftId = shift!.id;
  });
  it('enforces branch assignment through the central guard', async () => {
    await expect(BranchContextService.assertBranchAccess({ userId: cashierId, role: code, permissions: [], assignedBranchIds: [], isSuperAdmin: false }, branchId)).rejects.toThrow(ForbiddenError);
  });
  it('rejects foreign branch context and unprivileged discounts', async () => {
    await expect(create.execute(request(), { ...scope(), branchId: crypto.randomUUID() })).rejects.toThrow(ForbiddenError);
    await expect(create.execute({ ...request(), discountMinor: 100 }, scope())).rejects.toThrow(ForbiddenError);
  });
  it('rejects wrong shift and mismatched payment without a partial order', async () => {
    await expect(create.execute({ ...request(), cashShiftId: crypto.randomUUID() }, scope())).rejects.toThrow(ValidationError);
    const input = request(); input.payments[0].amountMinor -= 1;
    await expect(create.execute(input, scope())).rejects.toThrow(ValidationError);
    expect(await prisma.order.count({ where: { posIdempotencyKey: input.idempotencyKey } })).toBe(0);
  });
  it('records a mixed paid sale with no fictitious CRM customer', async () => {
    const input = request(); input.type = OrderType.DINE_IN;
    input.payments = [{ method: PaymentMethod.CASH, amountMinor: 3000 }, { method: PaymentMethod.CARD, amountMinor: totalMinor - 3000 }];
    const receipt = await create.execute(input, scope());
    expect(receipt.payments).toHaveLength(2);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(order.customerId).toBeNull(); expect(order.customerPhone).toBeNull();
    expect(order.paymentMethod).toBe(PaymentMethod.MIXED);
    expect(order.status).toBe(OrderStatus.PREPARING);
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
  });
  it('returns the same sale for concurrent identical requests', async () => {
    const input = request();
    const receipts = await Promise.all([create.execute(input, scope()), create.execute(input, scope())]);
    expect(receipts[0].id).toBe(receipts[1].id);
    expect(await prisma.order.count({ where: { posIdempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(await prisma.orderPayment.count({ where: { orderId: receipts[0].id } })).toBe(1);
  });
  it('rejects reuse of a key with changed contents or another cashier', async () => {
    const input = request(); await create.execute(input, scope());
    await expect(create.execute({ ...input, type: OrderType.DINE_IN }, scope())).rejects.toThrow(ConflictError);
    await expect(create.execute(input, { ...scope(), cashierId: crypto.randomUUID() })).rejects.toThrow(ForbiddenError);
  });
  it('rejects unavailable products and archived categories', async () => {
    await prisma.branchProductAvailability.create({ data: { branchId, productId, isAvailable: false } });
    await expect(create.execute(request(), scope())).rejects.toThrow(ValidationError);
    await prisma.branchProductAvailability.delete({ where: { branchId_productId: { branchId, productId } } });
    await prisma.category.update({ where: { id: categoryId }, data: { isActive: false } });
    await expect(create.execute(request(), scope())).rejects.toThrow(ValidationError);
    await prisma.category.update({ where: { id: categoryId }, data: { isActive: true } });
  });
  it('isolates receipts and keeps POS sales out of public and online delivery views', async () => {
    const receipt = await create.execute(request(), scope());
    expect(await repository.recentReceipts({ ...scope(), cashierId: crypto.randomUUID() })).toHaveLength(0);
    await expect(new GetOrderTrackerUseCase().execute(receipt.orderNumber)).rejects.toThrow();
    expect((await new ListOrdersUseCase().execute({ branchId })).orders).toHaveLength(0);
  });
  it('closes against net CASH only, persists count, and rejects further sales', async () => {
    const input = request();
    const receipt = await create.execute(input, scope());
    const cash = await prisma.orderPayment.aggregate({ where: { method: PaymentMethod.CASH, order: { cashShiftId: shiftId } }, _sum: { amountMinor: true } });
    const expected = 2000 + (cash._sum.amountMinor ?? 0);
    const result = await new CloseCashShiftUseCase(repository).execute({ branchId, cashShiftId: shiftId, closingCashMinor: expected - 100 }, cashierId);
    expect(result.expectedCashMinor).toBe(expected); expect(result.varianceMinor).toBe(-100);
    await expect(create.execute(request(), scope())).rejects.toThrow(ValidationError);
    expect(await repository.getActiveShift(cashierId)).toBeNull();
    expect((await create.execute(input, scope())).id).toBe(receipt.id);
  });
  it('serializes closing against a concurrent sale without missing cash', async () => {
    shiftId = (await new OpenCashShiftUseCase(repository).execute({ branchId, openingCashMinor: 0 }, cashierId)).id;
    const results = await Promise.allSettled([
      create.execute(request(), scope()),
      new CloseCashShiftUseCase(repository).execute({ branchId, cashShiftId: shiftId, closingCashMinor: 0 }, cashierId),
    ]);
    expect(results[1].status).toBe('fulfilled');
    const payments = await prisma.orderPayment.aggregate({ where: { order: { cashShiftId: shiftId } }, _sum: { amountMinor: true } });
    if (results[1].status === 'fulfilled') expect(results[1].value.expectedCashMinor).toBe(payments._sum.amountMinor ?? 0);
    expect(await repository.getActiveShift(cashierId)).toBeNull();
  });
  it('preserves historical currency and allows closing a currency-mismatched shift', async () => {
    const settings = await repository.getSettings();
    shiftId = (await new OpenCashShiftUseCase(repository).execute({ branchId, openingCashMinor: 0 }, cashierId)).id;
    const receipt = await create.execute(request(), scope());
    const order = await prisma.order.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(order.currency).toBe(settings.currency);
    await prisma.cashShift.update({ where: { id: shiftId }, data: { currency: settings.currency === 'USD' ? 'EUR' : 'USD' } });
    await expect(create.execute(request(), scope())).rejects.toThrow(ValidationError);
    await new CloseCashShiftUseCase(repository).execute({ branchId, cashShiftId: shiftId, closingCashMinor: totalMinor }, cashierId);
  });
});
