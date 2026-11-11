import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/prisma';
import {
  InventoryItemDto,
  BranchStockItemDto,
  RecipeItemDto,
  StockAdjustmentInput,
  SupplierDto,
  PurchaseOrderDto,
  InventoryMovementDto,
} from '../../domain/inventory/contracts/inventory.repository';
import {
  UnitOfMeasure,
  InventoryMovementType,
  PurchaseOrderStatus,
} from '../../domain/inventory/enums';
import { NotFoundError, ValidationError } from '../../domain/shared/errors/domain-error';
import { Money } from '../../domain/shared/value-objects/money';
import { DocumentSequenceService } from '../../domain/ordering/services/document-sequence.service';

export class PrismaInventoryRepository {
  constructor(private readonly db = defaultPrisma) {}

  public async findInventoryItems(activeOnly = false): Promise<InventoryItemDto[]> {
    const items = await this.db.inventoryItem.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { nameAr: 'asc' },
    });

    return items.map((i) => ({
      id: i.id,
      sku: i.sku,
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      unit: i.unit as UnitOfMeasure,
      defaultCostMinor: i.defaultCostMinor,
      isActive: i.isActive,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
  }

  public async saveInventoryItem(data: {
    id?: string;
    sku?: string | null;
    nameAr: string;
    nameEn: string;
    unit: UnitOfMeasure;
    defaultCostMinor: number;
    isActive?: boolean;
  }): Promise<InventoryItemDto> {
    if (data.id) {
      const item = await this.db.inventoryItem.update({
        where: { id: data.id },
        data: {
          sku: data.sku ?? null,
          nameAr: data.nameAr,
          nameEn: data.nameEn,
          unit: data.unit,
          defaultCostMinor: data.defaultCostMinor,
          isActive: data.isActive ?? true,
        },
      });
      return {
        ...item,
        unit: item.unit as UnitOfMeasure,
      };
    }

    const item = await this.db.inventoryItem.create({
      data: {
        sku: data.sku ?? null,
        nameAr: data.nameAr,
        nameEn: data.nameEn,
        unit: data.unit,
        defaultCostMinor: data.defaultCostMinor,
        isActive: data.isActive ?? true,
      },
    });

    return {
      ...item,
      unit: item.unit as UnitOfMeasure,
    };
  }

  public async getBranchStock(branchId: string): Promise<BranchStockItemDto[]> {
    const items = await this.db.inventoryItem.findMany({
      where: { isActive: true },
      include: {
        branchInventories: {
          where: { branchId },
        },
      },
      orderBy: { nameAr: 'asc' },
    });

    return items.map((i) => {
      const branchStock = i.branchInventories[0];
      const quantity = branchStock ? Number(branchStock.quantity) : 0;
      const minThreshold = branchStock ? Number(branchStock.minThreshold) : 0;

      return {
        id: i.id,
        sku: i.sku,
        nameAr: i.nameAr,
        nameEn: i.nameEn,
        unit: i.unit as UnitOfMeasure,
        defaultCostMinor: i.defaultCostMinor,
        isActive: i.isActive,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        quantity,
        minThreshold,
        isLowStock: quantity <= minThreshold,
        isNegative: quantity < 0,
      };
    });
  }

  public async adjustStock(input: StockAdjustmentInput): Promise<InventoryMovementDto> {
    return this.db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
      if (!branch) throw new NotFoundError('الفرع');

      const item = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
      if (!item) throw new NotFoundError('المكون الخام');

      const updatedStock = await tx.branchInventory.upsert({
        where: { branchId_inventoryItemId: { branchId: input.branchId, inventoryItemId: input.inventoryItemId } },
        create: {
          branchId: input.branchId,
          inventoryItemId: input.inventoryItemId,
          quantity: new Prisma.Decimal(input.quantityDelta),
        },
        update: {
          quantity:
            input.quantityDelta >= 0
              ? { increment: new Prisma.Decimal(input.quantityDelta) }
              : { decrement: new Prisma.Decimal(Math.abs(input.quantityDelta)) },
        },
      });

      const qtyAfter = Number(updatedStock.quantity);
      const qtyBefore = Number((qtyAfter - input.quantityDelta).toFixed(3));

      const movement = await tx.inventoryMovement.create({
        data: {
          branchId: input.branchId,
          inventoryItemId: input.inventoryItemId,
          type: input.type,
          quantityDelta: new Prisma.Decimal(input.quantityDelta),
          quantityBefore: new Prisma.Decimal(qtyBefore),
          quantityAfter: new Prisma.Decimal(qtyAfter),
          unitCostMinor: input.unitCostMinor ?? item.defaultCostMinor,
          notes: input.notes ?? null,
          createdById: input.createdById ?? null,
        },
        include: {
          branch: true,
          inventoryItem: true,
          createdBy: true,
        },
      });

      return {
        id: movement.id,
        branchId: movement.branchId,
        branchName: movement.branch.nameAr,
        inventoryItemId: movement.inventoryItemId,
        inventoryItemNameAr: movement.inventoryItem.nameAr,
        unit: movement.inventoryItem.unit as UnitOfMeasure,
        type: movement.type as InventoryMovementType,
        quantityDelta: Number(movement.quantityDelta),
        quantityBefore: Number(movement.quantityBefore),
        quantityAfter: Number(movement.quantityAfter),
        unitCostMinor: movement.unitCostMinor,
        referenceId: movement.referenceId,
        notes: movement.notes,
        createdByName: movement.createdBy?.fullName ?? null,
        createdAt: movement.createdAt,
      };
    });
  }

  public async getProductRecipes(productId: string): Promise<RecipeItemDto[]> {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      include: {
        sizes: true,
        modifierGroups: {
          include: {
            group: {
              include: {
                modifiers: true,
              },
            },
          },
        },
      },
    });

    if (!product) throw new NotFoundError('الصنف');

    const sizeIds = product.sizes.map((s) => s.id);
    const modifierIds = product.modifierGroups.flatMap((mg) => mg.group.modifiers.map((m) => m.id));

    const recipes = await this.db.recipeItem.findMany({
      where: {
        OR: [
          { productId },
          { productSizeId: { in: sizeIds } },
          { modifierId: { in: modifierIds } },
        ],
      },
      include: {
        inventoryItem: true,
      },
    });

    return recipes.map((r) => ({
      id: r.id,
      inventoryItemId: r.inventoryItemId,
      inventoryItemNameAr: r.inventoryItem.nameAr,
      inventoryItemNameEn: r.inventoryItem.nameEn,
      unit: r.inventoryItem.unit as UnitOfMeasure,
      productId: r.productId,
      productSizeId: r.productSizeId,
      modifierId: r.modifierId,
      quantity: Number(r.quantity),
    }));
  }

  public async saveProductRecipes(
    productId: string,
    items: Array<{
      inventoryItemId: string;
      productSizeId?: string | null;
      modifierId?: string | null;
      quantity: number;
    }>
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: {
          sizes: true,
          modifierGroups: {
            include: { group: { include: { modifiers: true } } },
          },
        },
      });

      if (!product) throw new NotFoundError('الصنف');

      const sizeIds = product.sizes.map((s) => s.id);
      const modifierIds = product.modifierGroups.flatMap((mg) => mg.group.modifiers.map((m) => m.id));

      await tx.recipeItem.deleteMany({
        where: {
          OR: [
            { productId },
            { productSizeId: { in: sizeIds } },
            { modifierId: { in: modifierIds } },
          ],
        },
      });

      if (items.length > 0) {
        await tx.recipeItem.createMany({
          data: items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            productId: !item.productSizeId && !item.modifierId ? productId : null,
            productSizeId: item.productSizeId ?? null,
            modifierId: item.modifierId ?? null,
            quantity: new Prisma.Decimal(item.quantity),
          })),
        });
      }
    });
  }

  public async findSuppliers(): Promise<SupplierDto[]> {
    const suppliers = await this.db.supplier.findMany({
      orderBy: { name: 'asc' },
    });
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      taxNumber: s.taxNumber,
      isActive: s.isActive,
      createdAt: s.createdAt,
    }));
  }

  public async saveSupplier(data: {
    id?: string;
    name: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    taxNumber?: string | null;
    isActive?: boolean;
  }): Promise<SupplierDto> {
    if (data.id) {
      const supplier = await this.db.supplier.update({
        where: { id: data.id },
        data: {
          name: data.name,
          contactName: data.contactName ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          taxNumber: data.taxNumber ?? null,
          isActive: data.isActive ?? true,
        },
      });
      return supplier;
    }

    const supplier = await this.db.supplier.create({
      data: {
        name: data.name,
        contactName: data.contactName ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        taxNumber: data.taxNumber ?? null,
        isActive: data.isActive ?? true,
      },
    });
    return supplier;
  }

  public async findPurchaseOrders(branchId?: string): Promise<PurchaseOrderDto[]> {
    const orders = await this.db.purchaseOrder.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        supplier: true,
        branch: true,
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      supplierId: o.supplierId,
      supplierName: o.supplier.name,
      branchId: o.branchId,
      branchName: o.branch.nameAr,
      status: o.status as PurchaseOrderStatus,
      totalMinor: o.totalMinor,
      notes: o.notes,
      invoiceNumber: o.invoiceNumber,
      receivedAt: o.receivedAt,
      createdById: o.createdById,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({
        id: i.id,
        inventoryItemId: i.inventoryItemId,
        inventoryItemNameAr: i.inventoryItem.nameAr,
        unit: i.inventoryItem.unit as UnitOfMeasure,
        quantity: Number(i.quantity),
        unitCostMinor: i.unitCostMinor,
        totalCostMinor: i.totalCostMinor,
      })),
    }));
  }

  public async createPurchaseOrder(
    input: {
      supplierId: string;
      branchId: string;
      invoiceNumber?: string | null;
      notes?: string | null;
      items: Array<{
        inventoryItemId: string;
        quantity: number;
        unitCostMinor: number;
      }>;
    },
    userId?: string
  ): Promise<PurchaseOrderDto> {
    return this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundError('المورد');

      const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
      if (!branch) throw new NotFoundError('الفرع');

      const setting = await tx.restaurantSetting.findFirst();
      const currency = setting?.currency ?? 'EGP';

      let totalMoney = Money.zero(currency);
      const itemsData = input.items.map((item) => {
        const unitMoney = Money.fromMinor(item.unitCostMinor, currency);
        const lineMoney = unitMoney.multiply(item.quantity);
        totalMoney = totalMoney.add(lineMoney);
        return {
          inventoryItemId: item.inventoryItemId,
          quantity: new Prisma.Decimal(item.quantity),
          unitCostMinor: unitMoney.amount,
          totalCostMinor: lineMoney.amount,
        };
      });

      const orderNumber = await DocumentSequenceService.getNextPurchaseOrderNumber(tx);

      const order = await tx.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: input.supplierId,
          branchId: input.branchId,
          invoiceNumber: input.invoiceNumber ?? null,
          notes: input.notes ?? null,
          totalMinor: totalMoney.amount,
          createdById: userId ?? null,
          items: {
            create: itemsData,
          },
        },
        include: {
          supplier: true,
          branch: true,
          items: {
            include: { inventoryItem: true },
          },
        },
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        supplierName: order.supplier.name,
        branchId: order.branchId,
        branchName: order.branch.nameAr,
        status: order.status as PurchaseOrderStatus,
        totalMinor: order.totalMinor,
        notes: order.notes,
        invoiceNumber: order.invoiceNumber,
        receivedAt: order.receivedAt,
        createdById: order.createdById,
        createdAt: order.createdAt,
        items: order.items.map((i) => ({
          id: i.id,
          inventoryItemId: i.inventoryItemId,
          inventoryItemNameAr: i.inventoryItem.nameAr,
          unit: i.inventoryItem.unit as UnitOfMeasure,
          quantity: Number(i.quantity),
          unitCostMinor: i.unitCostMinor,
          totalCostMinor: i.totalCostMinor,
        })),
      };
    });
  }

  public async receivePurchaseOrder(orderId: string, userId?: string): Promise<PurchaseOrderDto> {
    return this.db.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { inventoryItem: true } },
          supplier: true,
          branch: true,
        },
      });

      if (!order) throw new NotFoundError('أمر الشراء');
      if (order.status !== PurchaseOrderStatus.DRAFT) {
        throw new ValidationError('أمر الشراء تم استلامه أو إلغاؤه مسبقاً');
      }

      const receivedAt = new Date();

      const updateResult = await tx.purchaseOrder.updateMany({
        where: { id: orderId, status: PurchaseOrderStatus.DRAFT },
        data: {
          status: PurchaseOrderStatus.RECEIVED,
          receivedAt,
        },
      });

      if (updateResult.count === 0) {
        throw new ValidationError('أمر الشراء تم استلامه أو إلغاؤه مسبقاً');
      }

      for (const item of order.items) {
        const itemQty = Number(item.quantity);

        const updatedStock = await tx.branchInventory.upsert({
          where: { branchId_inventoryItemId: { branchId: order.branchId, inventoryItemId: item.inventoryItemId } },
          create: {
            branchId: order.branchId,
            inventoryItemId: item.inventoryItemId,
            quantity: new Prisma.Decimal(itemQty),
          },
          update: {
            quantity: { increment: new Prisma.Decimal(itemQty) },
          },
        });

        const qtyAfter = Number(updatedStock.quantity);
        const qtyBefore = Number((qtyAfter - itemQty).toFixed(3));

        await tx.inventoryMovement.create({
          data: {
            branchId: order.branchId,
            inventoryItemId: item.inventoryItemId,
            type: InventoryMovementType.PURCHASE,
            quantityDelta: new Prisma.Decimal(itemQty),
            quantityBefore: new Prisma.Decimal(qtyBefore),
            quantityAfter: new Prisma.Decimal(qtyAfter),
            unitCostMinor: item.unitCostMinor,
            referenceId: order.id,
            notes: `استلام أمر شراء رقم ${order.orderNumber}`,
            createdById: userId ?? null,
          },
        });
      }

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        supplierName: order.supplier.name,
        branchId: order.branchId,
        branchName: order.branch.nameAr,
        status: PurchaseOrderStatus.RECEIVED,
        totalMinor: order.totalMinor,
        notes: order.notes,
        invoiceNumber: order.invoiceNumber,
        receivedAt,
        createdById: order.createdById,
        createdAt: order.createdAt,
        items: order.items.map((i) => ({
          id: i.id,
          inventoryItemId: i.inventoryItemId,
          inventoryItemNameAr: i.inventoryItem.nameAr,
          unit: i.inventoryItem.unit as UnitOfMeasure,
          quantity: Number(i.quantity),
          unitCostMinor: i.unitCostMinor,
          totalCostMinor: i.totalCostMinor,
        })),
      };
    });
  }

  public async listMovements(filter: {
    branchId?: string;
    inventoryItemId?: string;
    type?: InventoryMovementType;
    limit?: number;
  }): Promise<InventoryMovementDto[]> {
    const movements = await this.db.inventoryMovement.findMany({
      where: {
        branchId: filter.branchId,
        inventoryItemId: filter.inventoryItemId,
        type: filter.type,
      },
      include: {
        branch: true,
        inventoryItem: true,
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
    });

    return movements.map((m) => ({
      id: m.id,
      branchId: m.branchId,
      branchName: m.branch.nameAr,
      inventoryItemId: m.inventoryItemId,
      inventoryItemNameAr: m.inventoryItem.nameAr,
      unit: m.inventoryItem.unit as UnitOfMeasure,
      type: m.type as InventoryMovementType,
      quantityDelta: Number(m.quantityDelta),
      quantityBefore: Number(m.quantityBefore),
      quantityAfter: Number(m.quantityAfter),
      unitCostMinor: m.unitCostMinor,
      referenceId: m.referenceId,
      notes: m.notes,
      createdByName: m.createdBy?.fullName ?? null,
      createdAt: m.createdAt,
    }));
  }
}
