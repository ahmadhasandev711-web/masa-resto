import { Prisma } from '@prisma/client';
import { PosProduct, PosReceipt, PosRequest, PosResolvedLine, PosScope, PosSettings, PosTotals, PosTransaction } from '../../domain/pos/contracts/pos.repository';
import { CashShiftStatus } from '../../domain/pos/enums';
import { NotFoundError, ValidationError } from '../../domain/shared/errors/domain-error';
import { OrderSource, OrderStatus, PaymentMethod, PaymentStatus } from '../../domain/ordering/enums';
import { InventoryConsumptionService } from '../../domain/inventory/services/inventory-consumption.service';
import { InventoryMovementType } from '../../domain/inventory/enums';
import { OrderNumberService } from '../../domain/ordering/services/order-number.service';
import { Money } from '../../domain/shared/value-objects/money';
import { mapPosReceipt, posReceiptInclude } from './prisma-pos.mapper';

export class PrismaPosTransaction implements PosTransaction {
  constructor(private readonly client: Prisma.TransactionClient) {}

  public async lockShift(id: string, scope: PosScope, enforceCurrency = true): Promise<void> {
    await this.client.$queryRaw(Prisma.sql`SELECT id FROM cash_shifts WHERE id = ${id} FOR UPDATE`);
    const shift = await this.client.cashShift.findFirst({ where: { id, branchId: scope.branchId, cashierId: scope.cashierId, status: CashShiftStatus.OPEN } });
    const branch = await this.client.branch.findFirst({ where: { id: scope.branchId, isActive: true } });
    if (!shift || !branch) throw new ValidationError('الوردية مغلقة أو لا تخص الكاشير والفرع النشط');
    const setting = await this.getSettings();
    if (enforceCurrency && shift.currency && shift.currency !== setting.currency) throw new ValidationError('تغيرت عملة المطعم؛ أغلق الوردية قبل بدء مبيعات بالعملة الجديدة');
  }

  public async findReplay(key: string): Promise<PosReceipt | null> {
    const order = await this.client.order.findUnique({ where: { posIdempotencyKey: key }, include: posReceiptInclude });
    if (!order) return null;
    const settings = await this.getSettings();
    return mapPosReceipt(order, settings.currency, settings.locale);
  }

  public async getSettings(): Promise<PosSettings> {
    const setting = await this.client.restaurantSetting.findFirst();
    if (!setting) throw new NotFoundError('إعدادات المطعم');
    return {
      nameAr: setting.nameAr,
      nameEn: setting.nameEn,
      currency: setting.currency,
      locale: setting.locale,
      taxRatePercent: setting.taxRatePercent.toString(),
      pricesIncludeTax: setting.pricesIncludeTax,
      serviceChargePercent: setting.serviceChargePercent.toString(),
      maxCashierDiscountPercent: setting.maxCashierDiscountPercent.toString(),
    };
  }

  public async getProducts(branchId: string, ids: string[]): Promise<PosProduct[]> {
    const products = await this.client.product.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        NOT: { branchAvailability: { some: { branchId, isAvailable: false } } },
      },
      include: {
        sizes: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        modifierGroups: {
          where: { group: { isActive: true } },
          include: { group: { include: { modifiers: { where: { isActive: true } } } } },
        },
      },
    });
    return products.map((product) => ({
      ...product,
      modifierGroups: product.modifierGroups.map(({ group }) => group),
    }));
  }

  public async saveSale(request: PosRequest, scope: PosScope, settings: PosSettings, totals: PosTotals, lines: PosResolvedLine[]): Promise<PosReceipt> {
    const orderNumber = await OrderNumberService.getNextOrderNumber(this.client);
    const order = await this.client.order.create({
      data: { orderNumber, source: OrderSource.POS, type: request.type,
        status: OrderStatus.PREPARING, paymentStatus: PaymentStatus.PAID, kitchenStartedAt: new Date(),
        paymentMethod: request.payments.length > 1 ? PaymentMethod.MIXED : request.payments[0].method,
        branchId: scope.branchId, cashierId: scope.cashierId, cashShiftId: request.cashShiftId,
        posIdempotencyKey: request.idempotencyKey, customerName: request.customerName ?? null, customerPhone: null,
        customerNotes: request.customerNotes ?? null, ...totals, currency: settings.currency, taxRatePercent: settings.taxRatePercent,
        items: { create: lines.map(({ modifiers, ...line }) => ({ ...line, modifiers: { create: modifiers } })) },
        payments: { create: request.payments } },
      include: posReceiptInclude,
    });

    await this.deductInventoryForSale(scope, order.id, order.orderNumber, lines);

    return mapPosReceipt(order, settings.currency, settings.locale);
  }

  private async deductInventoryForSale(scope: PosScope, orderId: string, orderNumber: string, lines: PosResolvedLine[]): Promise<void> {
    const productIds = lines.map((l) => l.productId);
    const sizeIds = lines.map((l) => l.sizeId).filter(Boolean);
    const modifierIds = lines.flatMap((l) => l.modifiers.map((m) => m.modifierId));

    const recipeItems = await this.client.recipeItem.findMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          { productSizeId: { in: sizeIds } },
          { modifierId: { in: modifierIds } },
        ],
      },
      include: {
        inventoryItem: true,
      },
    });

    if (recipeItems.length === 0) return;

    const deductions = InventoryConsumptionService.calculateDeductions(
      lines.map((l) => ({
        productId: l.productId,
        sizeId: l.sizeId,
        modifierIds: l.modifiers.map((m) => m.modifierId),
        quantity: l.quantity,
      })),
      recipeItems.map((r) => ({
        inventoryItemId: r.inventoryItemId,
        productId: r.productId,
        productSizeId: r.productSizeId,
        modifierId: r.modifierId,
        quantity: Number(r.quantity),
      }))
    );

    for (const deduction of deductions) {
      const updatedStock = await this.client.branchInventory.upsert({
        where: { branchId_inventoryItemId: { branchId: scope.branchId, inventoryItemId: deduction.inventoryItemId } },
        create: {
          branchId: scope.branchId,
          inventoryItemId: deduction.inventoryItemId,
          quantity: new Prisma.Decimal(-deduction.quantity),
        },
        update: {
          quantity: {
            decrement: new Prisma.Decimal(deduction.quantity),
          },
        },
      });

      const qtyAfter = Number(updatedStock.quantity);
      const qtyBefore = Number((qtyAfter + deduction.quantity).toFixed(3));
      const rawCost = recipeItems.find((r) => r.inventoryItemId === deduction.inventoryItemId)?.inventoryItem.defaultCostMinor ?? 0;
      const unitCostMinor = Money.fromMinor(rawCost, 'EGP').amount;

      await this.client.inventoryMovement.create({
        data: {
          branchId: scope.branchId,
          inventoryItemId: deduction.inventoryItemId,
          type: InventoryMovementType.SALE_POS,
          quantityDelta: new Prisma.Decimal(-deduction.quantity),
          quantityBefore: new Prisma.Decimal(qtyBefore),
          quantityAfter: new Prisma.Decimal(qtyAfter),
          unitCostMinor,
          referenceId: orderId,
          notes: `خصم بيع فاتورة ${orderNumber}`,
          createdById: scope.cashierId,
        },
      });
    }
  }
}
