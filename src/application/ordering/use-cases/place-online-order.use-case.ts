import { prisma } from '../../../infrastructure/db/prisma';
import { NotFoundError, ValidationError } from '../../../domain/shared/errors/domain-error';
import { Money } from '../../../domain/shared/value-objects/money';
import { OrderPricingService, PricingItemInput } from '../../../domain/ordering/services/order-pricing.service';
import { DocumentSequenceService } from '../../../domain/ordering/services/document-sequence.service';
import { OrderStatus, OrderSource, OrderType, PaymentStatus, PaymentMethod } from '../../../domain/ordering/enums';
import { MatchOrCreateCustomerUseCase } from '../../customers/use-cases/match-or-create-customer.use-case';
import { PlaceOnlineOrderDto, placeOnlineOrderSchema } from '../dto/order.dto';

interface ResolvedModifierData {
  id: string;
  nameAr: string;
  nameEn: string;
  priceDelta: number;
}

interface ResolvedOrderItemData {
  productId: string;
  sizeId: string;
  productNameAr: string;
  productNameEn: string;
  sizeNameAr: string;
  sizeNameEn: string;
  unitPriceMinor: number;
  quantity: number;
  modifiers: ResolvedModifierData[];
}

export class PlaceOnlineOrderUseCase {
  public async execute(input: PlaceOnlineOrderDto) {
    const validated = placeOnlineOrderSchema.parse(input);

    // 0. Idempotent Replay Check (GR-4.1)
    if (validated.idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { onlineIdempotencyKey: validated.idempotencyKey },
        include: {
          items: {
            include: { modifiers: true },
          },
        },
      });
      if (existing) {
        return existing;
      }
    }

    const setting = await prisma.restaurantSetting.findFirst();
    if (!setting) {
      throw new NotFoundError('إعدادات المطعم غير مهيأة');
    }

    if (validated.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: validated.branchId, isActive: true, deletedAt: null },
      });
      if (!branch) {
        throw new ValidationError('الفرع المختار غير متاح أو متوقف حالياً');
      }
    }

    const currency = setting.currency;
    const deliveryFee = Money.fromMinor(setting.deliveryFee, currency);
    const taxRatePercent = Number(setting.taxRatePercent);

    // 1. Fetch & Verify all items directly from database (GR-3.2: server-verified prices)
    const pricingItems: PricingItemInput[] = [];
    const resolvedItemsData: ResolvedOrderItemData[] = [];

    for (const itemInput of validated.items) {
      const product = await prisma.product.findUnique({
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

      if (!product || !product.isActive) {
        throw new NotFoundError(`الصنف غير متوفر حالياً`);
      }

      const size = product.sizes[0];
      if (!size) {
        throw new ValidationError(`المقاس المختار غير متوفر للصنف: ${product.nameAr}`);
      }

      // Collect valid selected modifiers
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

    // 2. Compute Exact Pricing
    const pricing = OrderPricingService.calculate(pricingItems, deliveryFee, taxRatePercent);

    // 3. Address Formatting
    const fullAddressSummary = [
      validated.area,
      validated.street,
      validated.building ? `عمارة ${validated.building}` : null,
      validated.floor ? `طابق ${validated.floor}` : null,
      validated.apartment ? `شقة ${validated.apartment}` : null,
      validated.landmark ? `(علامة: ${validated.landmark})` : null,
    ].filter(Boolean).join('، ');


    // 5. Atomic All-or-Nothing Transaction (GR-4.1, ACID)
    try {
      return await prisma.$transaction(async (tx) => {
        // Match or create customer inside transaction so no orphaned CRM records occur on failure
        const customerResult = await new MatchOrCreateCustomerUseCase().execute(
          {
            phone: validated.customerPhone,
            fullName: validated.customerName,
            email: validated.customerEmail || undefined,
            address: {
              title: 'عنوان التوصيل',
              city: 'Cairo',
              area: validated.area,
              street: validated.street,
              building: validated.building,
              floor: validated.floor,
              apartment: validated.apartment,
              landmark: validated.landmark,
              deliveryNotes: validated.deliveryNotes,
            },
          },
          tx
        );

        // 4. Generate sequential daily order number: WEB-YYYYMMDD-NNN (atomic inside tx)
        const orderNumber = await DocumentSequenceService.getNextWebOrderNumber(tx);

        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            onlineIdempotencyKey: validated.idempotencyKey || null,
            customerId: customerResult.customer.id,
            source: OrderSource.ONLINE,
            type: OrderType.DELIVERY,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            paymentMethod: PaymentMethod.CASH,
            subtotalMinor: pricing.subtotal.amount,
            deliveryFeeMinor: pricing.deliveryFee.amount,
            taxRatePercent: setting.taxRatePercent,
            taxMinor: pricing.tax.amount,
            serviceMinor: 0,
            discountMinor: pricing.discount.amount,
            totalMinor: pricing.total.amount,
            customerName: validated.customerName.trim(),
            customerPhone: customerResult.customer.phone,
            deliveryAddress: fullAddressSummary,
            deliveryNotes: validated.deliveryNotes?.trim() || null,
            customerNotes: validated.customerNotes?.trim() || null,
            items: {
              create: resolvedItemsData.map((item) => {
                const itemTotalMinor = (item.unitPriceMinor + item.modifiers.reduce((sum, m) => sum + m.priceDelta, 0)) * item.quantity;
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
            items: {
              include: { modifiers: true },
            },
          },
        });

        // Update customer stats atomically
        await tx.customer.update({
          where: { id: customerResult.customer.id },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: pricing.total.amount },
            lastOrderAt: new Date(),
          },
        });

        return {
          ...createdOrder,
          taxRatePercent: Number(createdOrder.taxRatePercent),
        };
      });
    } catch (err: unknown) {
      // If concurrent request already inserted with same idempotencyKey, return existing
      const errorObj = err as { code?: string; message?: string } | null;
      if (
        validated.idempotencyKey &&
        errorObj &&
        (errorObj.code === 'P2002' || errorObj.message?.includes('online_idempotency_key'))
      ) {
        const replay = await prisma.order.findUnique({
          where: { onlineIdempotencyKey: validated.idempotencyKey },
          include: {
            items: {
              include: { modifiers: true },
            },
          },
        });
        if (replay) {
          return {
            ...replay,
            taxRatePercent: Number(replay.taxRatePercent),
          };
        }
      }
      throw err;
    }
  }
}


