import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { NotFoundError } from '../../../domain/shared/errors/domain-error';
import { TableStatus } from '../../../domain/tables/enums';
import { OrderStatus } from '../../../domain/ordering/enums';
import { Money } from '../../../domain/shared/value-objects/money';
import { OrderPricingService, PricingItemInput } from '../../../domain/ordering/services/order-pricing.service';
import { PosSaleService } from '../../../domain/pos/services/pos-sale.service';
import { PrismaPosTransaction } from '../../../infrastructure/pos/prisma-pos-transaction';
import { AddItemsToTabDto, addItemsToTabSchema } from '../dto/table.dto';

export class AddItemsToTabUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: AddItemsToTabDto) {
    const validated = addItemsToTabSchema.parse(input);

    return this.db.$transaction(async (tx) => {
      // 1. Lock Order with FOR UPDATE to prevent race conditions during concurrent additions (H9)
      await tx.$queryRaw(
        Prisma.sql`SELECT id, is_tab_open, branch_id, table_id, status FROM orders WHERE id = ${validated.orderId} FOR UPDATE`
      );

      const order = await tx.order.findUnique({
        where: { id: validated.orderId },
        include: {
          items: { include: { modifiers: true } },
          table: true,
        },
      });

      if (!order || !order.isTabOpen) {
        throw new NotFoundError('الطلب المفتوح للطاولة غير موجود أو تم إغلاقه');
      }

      const setting = await tx.restaurantSetting.findFirst();
      const currency = setting?.currency ?? 'EGP';
      const taxRatePercent = Number(order.taxRatePercent);

      // 2. Fetch and validate products through unified POS catalog validator
      const productIds = Array.from(new Set(validated.items.map((i) => i.productId)));
      const posTx = new PrismaPosTransaction(tx);
      const branchId = order.branchId ?? order.table?.branchId ?? '';
      const products = await posTx.getProducts(branchId, productIds);

      // Resolve each line using PosSaleService.resolveLine (verifies min/max modifiers, prices, and status)
      const resolvedLines = validated.items.map((item) =>
        PosSaleService.resolveLine(item, products, currency)
      );

      // 3. Re-calculate existing + new totals atomically
      const existingPricingItems: PricingItemInput[] = order.items.map((item) => ({
        unitPrice: Money.fromMinor(item.unitPriceMinor, currency),
        quantity: item.quantity,
        modifierDeltas: item.modifiers.map((m: { priceDeltaMinor: number }) =>
          Money.fromMinor(m.priceDeltaMinor, currency)
        ),
      }));

      const newPricingItems: PricingItemInput[] = resolvedLines.map((line) => ({
        unitPrice: Money.fromMinor(line.unitPriceMinor, currency),
        quantity: line.quantity,
        modifierDeltas: line.modifiers.map((m) =>
          Money.fromMinor(m.priceDeltaMinor, currency)
        ),
      }));

      const allPricingItems = [...existingPricingItems, ...newPricingItems];
      const newPricing = OrderPricingService.calculateDetailed({
        items: allPricingItems,
        deliveryFee: Money.fromMinor(0, currency),
        taxRatePercent,
        discount: Money.fromMinor(order.discountMinor ?? 0, currency),
        isDineIn: true,
        serviceChargePercent: Number(setting?.serviceChargePercent ?? 0),
        pricesIncludeTax: Boolean(setting?.pricesIncludeTax),
      });

      // 4. Create new order items in database
      for (const line of resolvedLines) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: line.productId,
            sizeId: line.sizeId,
            productNameAr: line.productNameAr,
            productNameEn: line.productNameEn,
            sizeNameAr: line.sizeNameAr,
            sizeNameEn: line.sizeNameEn,
            unitPriceMinor: line.unitPriceMinor,
            quantity: line.quantity,
            totalPriceMinor: line.totalPriceMinor,
            modifiers: {
              create: line.modifiers.map((m) => ({
                modifierId: m.modifierId,
                nameAr: m.nameAr,
                nameEn: m.nameEn,
                priceDeltaMinor: m.priceDeltaMinor,
              })),
            },
          },
        });
      }

      // 5. Update order totals atomically
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          subtotalMinor: newPricing.subtotal.amount,
          taxMinor: newPricing.tax.amount,
          serviceMinor: newPricing.service.amount,
          totalMinor: newPricing.total.amount,
          billPrintedAt: null, // Reset bill printed state since new dishes were ordered
          status: OrderStatus.PREPARING,
          kitchenCompletedAt: null,
        },
        include: {
          items: { include: { modifiers: true } },
        },
      });

      // 6. If table was in BILL_PRINTED status, return it to OCCUPIED
      if (order.tableId) {
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: { status: TableStatus.OCCUPIED },
        });
      }

      return {
        order: {
          ...updatedOrder,
          taxRatePercent: Number(updatedOrder.taxRatePercent),
        },
      };
    });
  }
}
