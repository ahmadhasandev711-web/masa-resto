import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { OrderStatus } from '../../../domain/ordering/enums';
import { GetKitchenOrdersDto, getKitchenOrdersSchema } from '../dto/kitchen.dto';

export interface KitchenOrderLineItem {
  id: string;
  productId: string;
  sizeId: string | null;
  productNameAr: string;
  productNameEn: string;
  sizeNameAr: string | null;
  sizeNameEn: string | null;
  quantity: number;
  unitPriceMinor: number;
  totalPriceMinor: number;
  isPrepared: boolean;
  preparedAt: string | null;
  categoryNameAr?: string | null;
  modifiers: Array<{
    id: string;
    modifierId: string;
    nameAr: string;
    nameEn: string;
    priceDeltaMinor: number;
  }>;
}

export interface KitchenOrderCard {
  id: string;
  orderNumber: string;
  source: string;
  type: string;
  status: string;
  branchId: string | null;
  branchNameAr: string | null;
  tableId: string | null;
  tableName: string | null;
  sectionNameAr: string | null;
  customerName: string | null;
  customerNotes: string | null;
  kitchenNotes: string | null;
  createdAt: string;
  kitchenStartedAt: string;
  elapsedSeconds: number;
  totalItemsCount: number;
  preparedItemsCount: number;
  items: KitchenOrderLineItem[];
}

export class GetKitchenOrdersUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: GetKitchenOrdersDto): Promise<KitchenOrderCard[]> {
    const validated = getKitchenOrdersSchema.parse(input);

    const orders = await this.db.order.findMany({
      where: {
        ...(validated.branchId ? { branchId: validated.branchId } : {}),
        OR: [
          { status: OrderStatus.PREPARING },
          { isTabOpen: true, items: { some: { isPrepared: false } } },
        ],
      },
      include: {
        branch: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            code: true,
          },
        },
        table: {
          select: {
            id: true,
            tableNumber: true,
            section: {
              select: {
                nameAr: true,
                nameEn: true,
              },
            },
          },
        },
        items: {
          include: {
            modifiers: true,
            product: {
              select: {
                category: {
                  select: {
                    nameAr: true,
                    nameEn: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { kitchenStartedAt: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const now = Date.now();

    return orders.map((order) => {
      const startTime = order.kitchenStartedAt ? new Date(order.kitchenStartedAt).getTime() : new Date(order.createdAt).getTime();
      const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));

      const items: KitchenOrderLineItem[] = order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        sizeId: item.sizeId,
        productNameAr: item.productNameAr,
        productNameEn: item.productNameEn,
        sizeNameAr: item.sizeNameAr,
        sizeNameEn: item.sizeNameEn,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalPriceMinor: item.totalPriceMinor,
        isPrepared: item.isPrepared,
        preparedAt: item.preparedAt ? item.preparedAt.toISOString() : null,
        categoryNameAr: item.product?.category?.nameAr ?? null,
        modifiers: item.modifiers.map((m) => ({
          id: m.id,
          modifierId: m.modifierId,
          nameAr: m.nameAr,
          nameEn: m.nameEn,
          priceDeltaMinor: m.priceDeltaMinor,
        })),
      }));

      const preparedItemsCount = items.filter((i) => i.isPrepared).length;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        source: order.source,
        type: order.type,
        status: order.status,
        branchId: order.branchId,
        branchNameAr: order.branch?.nameAr ?? null,
        tableId: order.tableId,
        tableName: order.tableName ?? order.table?.tableNumber ?? null,
        sectionNameAr: order.table?.section?.nameAr ?? null,
        customerName: order.customerName,
        customerNotes: order.customerNotes,
        kitchenNotes: order.kitchenNotes,
        createdAt: order.createdAt.toISOString(),
        kitchenStartedAt: (order.kitchenStartedAt ?? order.createdAt).toISOString(),
        elapsedSeconds,
        totalItemsCount: items.length,
        preparedItemsCount,
        items,
      };
    });
  }
}
