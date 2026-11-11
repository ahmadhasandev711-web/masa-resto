import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/infrastructure/db/prisma';
import { OrderInventoryDeductionService } from '../../src/infrastructure/inventory/order-inventory-deduction.service';
import { PrismaInventoryRepository } from '../../src/infrastructure/inventory/prisma-inventory.repository';
import { GetSalesAnalyticsUseCase } from '../../src/application/reports/use-cases/get-sales-analytics.use-case';
import { InventoryMovementType, UnitOfMeasure } from '../../src/domain/inventory/enums';
import { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '../../src/domain/ordering/enums';
import { ValidationError } from '../../src/domain/shared/errors/domain-error';

describe('Atomic Inventory Deductions, PO Receiving, and COGS/Sales Accuracy', () => {
  let branchId: string;
  let supplierId: string;
  let inventoryItemId: string;
  let categoryId: string;
  let productId: string;
  let sizeId: string;
  let onlineOrderId: string;
  let pendingOrderId: string;
  let purchaseOrderId: string;

  beforeAll(async () => {
    // 1. Create test branch
    const branch = await prisma.branch.create({
      data: {
        code: 'BR-ATOMIC-' + Date.now().toString().slice(-4),
        nameAr: 'فرع فحص المخزون الذري',
        nameEn: 'Atomic Inventory Branch',
        phone: '01099999988',
        address: 'عنوان الفرع الذري',
      },
    });
    branchId = branch.id;

    // 2. Create test supplier
    const supplier = await prisma.supplier.create({
      data: {
        name: 'مورد فحص العمليات',
        phone: '01000000001',
      },
    });
    supplierId = supplier.id;

    // 3. Create raw InventoryItem
    const item = await prisma.inventoryItem.create({
      data: {
        sku: 'ATOMIC-CHEESE-' + Date.now(),
        nameAr: 'جبن شيدر ذري',
        nameEn: 'Atomic Cheddar Cheese',
        unit: UnitOfMeasure.GRAM,
        defaultCostMinor: 50, // 0.50 EGP per gram
      },
    });
    inventoryItemId = item.id;

    // Initialize stock at 1000 grams
    await prisma.branchInventory.create({
      data: {
        branchId,
        inventoryItemId,
        quantity: 1000.0,
      },
    });

    // 4. Create Category, Product, Size, and BOM Recipe
    const category = await prisma.category.create({
      data: {
        nameAr: 'برجر ذري',
        nameEn: 'Atomic Burger Category',
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        nameAr: 'برجر بالجبنة الذري',
        nameEn: 'Atomic Cheese Burger',
        sizes: {
          create: [{ nameAr: 'عادي', nameEn: 'Regular', price: 8000 }],
        },
      },
      include: { sizes: true },
    });
    productId = product.id;
    sizeId = product.sizes[0].id;

    // Link recipe: each regular burger consumes 50 grams of cheese
    await prisma.recipeItem.create({
      data: {
        inventoryItemId,
        productId,
        productSizeId: sizeId,
        quantity: 50.0,
      },
    });

    // 5. Create an Online Delivery Order (2 burgers = 100 grams cheese)
    const onlineOrder = await prisma.order.create({
      data: {
        orderNumber: 'ONL-' + Date.now(),
        branchId,
        source: OrderSource.ONLINE,
        type: OrderType.DELIVERY,
        status: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        subtotalMinor: 16000,
        taxMinor: 2240,
        discountMinor: 0,
        deliveryFeeMinor: 2000,
        totalMinor: 20240,
        items: {
          create: [
            {
              productId,
              sizeId,
              productNameAr: 'برجر بالجبنة الذري',
              productNameEn: 'Atomic Cheese Burger',
              unitPriceMinor: 8000,
              quantity: 2,
              totalPriceMinor: 16000,
            },
          ],
        },
      },
    });
    onlineOrderId = onlineOrder.id;

    // 6. Create a PENDING web order to test revenue exclusion
    const pendingOrder = await prisma.order.create({
      data: {
        orderNumber: 'PENDING-' + Date.now(),
        branchId,
        source: OrderSource.ONLINE,
        type: OrderType.DELIVERY,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        subtotalMinor: 99999,
        taxMinor: 0,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        totalMinor: 99999,
      },
    });
    pendingOrderId = pendingOrder.id;

    // 7. Create a DRAFT Purchase Order
    const po = await prisma.purchaseOrder.create({
      data: {
        orderNumber: 'PO-ATOMIC-' + Date.now(),
        branchId,
        supplierId,
        status: 'DRAFT',
        totalMinor: 25000,
        items: {
          create: [
            {
              inventoryItemId,
              quantity: 500.0, // 500 grams
              unitCostMinor: 50,
              totalCostMinor: 25000,
            },
          ],
        },
      },
    });
    purchaseOrderId = po.id;
  });

  afterAll(async () => {
    // Cleanup in foreign key order
    if (purchaseOrderId) {
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId } });
      await prisma.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
    }
    if (onlineOrderId || pendingOrderId) {
      await prisma.orderPayment.deleteMany({ where: { orderId: { in: [onlineOrderId, pendingOrderId] } } });
      await prisma.orderItemModifier.deleteMany({ where: { orderItem: { orderId: { in: [onlineOrderId, pendingOrderId] } } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: [onlineOrderId, pendingOrderId] } } });
      await prisma.order.deleteMany({ where: { id: { in: [onlineOrderId, pendingOrderId] } } });
    }
    if (productId) {
      await prisma.recipeItem.deleteMany({ where: { productId } });
      await prisma.productSize.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (inventoryItemId) {
      await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId } });
      await prisma.branchInventory.deleteMany({ where: { inventoryItemId } });
      await prisma.inventoryItem.deleteMany({ where: { id: inventoryItemId } });
    }
    if (supplierId) {
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
    }
    if (branchId) {
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
  });

  it('atomically deducts online delivery order BOM recipes and records SALE_ONLINE with replay idempotency', async () => {
    // 1. Initial deduction
    await OrderInventoryDeductionService.deductForOrder(
      onlineOrderId,
      prisma,
      InventoryMovementType.SALE_ONLINE,
      null
    );

    // 2. Verify stock was decremented from 1000 to 1000 - 100 = 900
    const stockAfter = await prisma.branchInventory.findUnique({
      where: { branchId_inventoryItemId: { branchId, inventoryItemId } },
    });
    expect(Number(stockAfter?.quantity)).toBe(900);

    // 3. Verify SALE_ONLINE movement was recorded
    const movement = await prisma.inventoryMovement.findFirst({
      where: {
        branchId,
        inventoryItemId,
        referenceId: onlineOrderId,
        type: InventoryMovementType.SALE_ONLINE,
      },
    });
    expect(movement).toBeDefined();
    expect(Number(movement?.quantityDelta)).toBe(-100);
    expect(movement?.unitCostMinor).toBe(50);

    // 4. Replay call: should NOT deduct a second time
    await OrderInventoryDeductionService.deductForOrder(
      onlineOrderId,
      prisma,
      InventoryMovementType.SALE_ONLINE,
      null
    );

    const stockAfterReplay = await prisma.branchInventory.findUnique({
      where: { branchId_inventoryItemId: { branchId, inventoryItemId } },
    });
    expect(Number(stockAfterReplay?.quantity)).toBe(900);
  });

  it('atomically receives purchase order and prevents duplicate receiving', async () => {
    const inventoryRepo = new PrismaInventoryRepository();

    // 1. First receive: succeeds and adds 500 grams
    const received = await inventoryRepo.receivePurchaseOrder(purchaseOrderId);
    expect(received.status).toBe('RECEIVED');

    // Stock should be 900 + 500 = 1400
    const stockAfterPO = await prisma.branchInventory.findUnique({
      where: { branchId_inventoryItemId: { branchId, inventoryItemId } },
    });
    expect(Number(stockAfterPO?.quantity)).toBe(1400);

    // 2. Second receive: must throw ValidationError
    await expect(
      inventoryRepo.receivePurchaseOrder(purchaseOrderId)
    ).rejects.toThrow(ValidationError);
  });

  it('excludes PENDING orders from realized sales analytics revenue', async () => {
    const useCase = new GetSalesAnalyticsUseCase();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const analytics = await useCase.execute({
      branchId,
      startDate,
      endDate,
    });

    // The online order (20240) is in PREPARING, but pending order (99999) is PENDING.
    // Realized revenue should include 20240, but must NOT include the 99999 pending order!
    expect(analytics.totalRevenueMinor).toBe(20240);
  });

  afterAll(async () => {
    try {
      if (branchId) {
        await prisma.inventoryMovement.deleteMany({ where: { branchId } }).catch(() => {});
        await prisma.orderPayment.deleteMany({ where: { order: { branchId } } }).catch(() => {});
        await prisma.orderItemModifier.deleteMany({ where: { orderItem: { order: { branchId } } } }).catch(() => {});
        await prisma.orderItem.deleteMany({ where: { order: { branchId } } }).catch(() => {});
        await prisma.order.deleteMany({ where: { branchId } }).catch(() => {});
        await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { branchId } } }).catch(() => {});
        await prisma.purchaseOrder.deleteMany({ where: { branchId } }).catch(() => {});
        await prisma.branchInventory.deleteMany({ where: { branchId } }).catch(() => {});
      }
      if (productId) {
        await prisma.recipeItem.deleteMany({ where: { productId } }).catch(() => {});
        await prisma.productSize.deleteMany({ where: { productId } }).catch(() => {});
        await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } }).catch(() => {});
      }
      if (inventoryItemId) {
        await prisma.inventoryItem.deleteMany({ where: { id: inventoryItemId } }).catch(() => {});
      }
      if (supplierId) {
        await prisma.supplier.deleteMany({ where: { id: supplierId } }).catch(() => {});
      }
      if (branchId) {
        await prisma.branch.deleteMany({ where: { id: branchId } }).catch(() => {});
      }
    } catch {
      // safe cleanup fallback
    }
  });
});
