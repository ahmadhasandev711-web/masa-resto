import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../domain/shared/errors/domain-error';
import { TableStatus } from '../../../domain/tables/enums';
import { OrderStatus, OrderSource, OrderType, PaymentStatus, PaymentMethod } from '../../../domain/ordering/enums';
import { Money } from '../../../domain/shared/value-objects/money';
import { OrderPricingService, PricingItemInput } from '../../../domain/ordering/services/order-pricing.service';
import { OrderNumberService } from '../../../domain/ordering/services/order-number.service';
import { OpenTableTabDto, openTableTabSchema } from '../dto/table.dto';

interface ResolvedTabItemData {
  productId: string;
  sizeId: string;
  productNameAr: string;
  productNameEn: string;
  sizeNameAr: string;
  sizeNameEn: string;
  unitPriceMinor: number;
  quantity: number;
  modifiers: Array<{ id: string; nameAr: string; nameEn: string; priceDelta: number }>;
}

export class OpenTableTabUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async execute(input: OpenTableTabDto) {
    const validated = openTableTabSchema.parse(input);

    // 1. Verify table status
    const table = await this.db.diningTable.findUnique({
      where: { id: validated.tableId },
    });

    if (!table || !table.isActive) {
      throw new NotFoundError('الطاولة', validated.tableId);
    }

    if (table.branchId !== validated.branchId) {
      throw new ValidationError('الطاولة لا تنتمي إلى هذا الفرع');
    }

    if (table.status !== TableStatus.AVAILABLE) {
      throw new ValidationError(`الطاولة ${table.tableNumber} مشغولة حالياً أو غير متاحة لفتح شيك جديد`);
    }

    // 2. Verify Cash Shift
    const shift = await this.db.cashShift.findUnique({
      where: { id: validated.cashShiftId },
    });
    if (!shift || shift.status !== 'OPEN') {
      throw new ValidationError('وردية الكاشير غير مفتوحة');
    }
    if (validated.cashierId && shift.cashierId !== validated.cashierId) {
      throw new ForbiddenError('الوردية المحددة لا تخص الكاشير الحالي');
    }
    if (shift.branchId !== table.branchId) {
      throw new ValidationError('الوردية لا تتبع نفس فرع الطاولة');
    }

    // 3. Get restaurant settings for tax and currency
    const setting = await this.db.restaurantSetting.findFirst();
    const currency = setting?.currency ?? 'EGP';
    const taxRatePercent = Number(setting?.taxRatePercent ?? 14);
    const serviceChargePercent = Number(setting?.serviceChargePercent ?? 0);
    const pricesIncludeTax = Boolean(setting?.pricesIncludeTax);

    // 4. Resolve initial items if any
    const pricingItems: PricingItemInput[] = [];
    const resolvedItemsData: ResolvedTabItemData[] = [];

    for (const itemInput of validated.items) {
      const product = await this.db.product.findUnique({
        where: { id: itemInput.productId },
        include: {
          sizes: { where: { id: itemInput.sizeId, isActive: true } },
          modifierGroups: {
            include: {
              group: {
                include: {
                  modifiers: { where: { id: { in: itemInput.modifierIds } } },
                },
              },
            },
          },
        },
      });

      if (!product || !product.isActive || product.sizes.length === 0) {
        throw new ValidationError(`الصنف غير متوفر حالياً`);
      }

      const size = product.sizes[0];
      const selectedModifiers = [];
      for (const pmg of product.modifierGroups) {
        for (const mod of pmg.group.modifiers) {
          if (itemInput.modifierIds.includes(mod.id)) {
            selectedModifiers.push(mod);
          }
        }
      }

      const unitPrice = Money.fromMinor(size.price, currency);
      const modifierDeltas = selectedModifiers.map((m) => Money.fromMinor(m.priceDelta, currency));

      pricingItems.push({
        unitPrice,
        quantity: itemInput.quantity,
        modifierDeltas,
      });

      resolvedItemsData.push({
        productId: product.id,
        sizeId: size.id,
        productNameAr: product.nameAr,
        productNameEn: product.nameEn,
        sizeNameAr: size.nameAr,
        sizeNameEn: size.nameEn,
        unitPriceMinor: unitPrice.amount,
        quantity: itemInput.quantity,
        modifiers: selectedModifiers,
      });
    }

    const zeroMoney = Money.fromMinor(0, currency);
    const pricing =
      pricingItems.length > 0
        ? OrderPricingService.calculateDetailed({
            items: pricingItems,
            deliveryFee: zeroMoney,
            taxRatePercent,
            discount: zeroMoney,
            isDineIn: true,
            serviceChargePercent,
            pricesIncludeTax,
          })
        : {
            subtotal: zeroMoney,
            deliveryFee: zeroMoney,
            service: zeroMoney,
            tax: zeroMoney,
            total: zeroMoney,
            discount: zeroMoney,
          };

    // 5. Atomic Transaction: Create Order & Update Table
    return this.db.$transaction(async (tx) => {
      // 5.0. Lock shift to ensure active state and prevent concurrency races
      if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw(
          Prisma.sql`SELECT id, status, cashier_id, branch_id FROM cash_shifts WHERE id = ${validated.cashShiftId} FOR UPDATE`
        );
      }

      // 5.1. Generate sequential human-friendly order number
      const orderNumber = await OrderNumberService.getNextOrderNumber(tx);

      // 5.2. Lock table row to prevent concurrent double-booking (SELECT ... FOR UPDATE)
      const lockedTables = await tx.$queryRaw<Array<{ id: string; status: string; tableNumber: string }>>`
        SELECT id, status, table_number as tableNumber FROM dining_tables WHERE id = ${validated.tableId} FOR UPDATE
      `;
      const lockedTable = lockedTables[0];
      if (!lockedTable || lockedTable.status !== TableStatus.AVAILABLE) {
        throw new ValidationError(`الطاولة ${lockedTable?.tableNumber ?? ''} مشغولة حالياً أو غير متاحة لفتح شيك جديد`);
      }

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          branchId: validated.branchId,
          cashierId: validated.cashierId ?? null,
          cashShiftId: validated.cashShiftId,
          source: OrderSource.POS,
          type: OrderType.DINE_IN,
          status: OrderStatus.PREPARING,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: PaymentMethod.CASH,
          subtotalMinor: pricing.subtotal.amount,
          deliveryFeeMinor: 0,
          taxRatePercent,
          taxMinor: pricing.tax.amount,
          serviceMinor: pricing.service.amount,
          discountMinor: 0,
          totalMinor: pricing.total.amount,
          tableId: table.id,
          tableName: table.tableNumber,
          guestCount: validated.guestCount,
          isTabOpen: true,
          kitchenStartedAt: new Date(),
          customerNotes: validated.customerNotes?.trim() || null,
          items: {
            create: resolvedItemsData.map((item) => {
              const itemTotalMinor =
                (item.unitPriceMinor + item.modifiers.reduce((sum: number, m: { priceDelta: number }) => sum + m.priceDelta, 0)) *
                item.quantity;
              return {
                productId: item.productId,
                sizeId: item.sizeId,
                productNameAr: item.productNameAr,
                productNameEn: item.productNameEn,
                sizeNameAr: item.sizeNameAr,
                sizeNameEn: item.sizeNameEn,
                unitPriceMinor: item.unitPriceMinor,
                quantity: item.quantity,
                totalPriceMinor: itemTotalMinor,
                modifiers: {
                  create: item.modifiers.map((m) => ({
                    modifierId: m.id,
                    nameAr: m.nameAr,
                    nameEn: m.nameEn,
                    priceDeltaMinor: m.priceDelta,
                  })),
                },
              };
            }),
          },
        },
        include: {
          items: { include: { modifiers: true } },
        },
      });

      const updatedTable = await tx.diningTable.update({
        where: { id: table.id },
        data: {
          status: TableStatus.OCCUPIED,
          activeOrderId: createdOrder.id,
        },
      });

      return {
        order: {
          ...createdOrder,
          taxRatePercent: Number(createdOrder.taxRatePercent),
        },
        table: updatedTable,
      };
    });
  }
}
