import { prisma } from '../../../infrastructure/db/prisma';
import { ListOrdersQueryInput, listOrdersQuerySchema } from '../dto/order.dto';
import { Prisma } from '@prisma/client';
import { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '../../../domain/ordering/enums';

export class ListOrdersUseCase {
  public async execute(input: ListOrdersQueryInput = {}) {
    const validated = listOrdersQuerySchema.parse(input);
    const {
      status,
      branchId,
      allowedBranchIds,
      source,
      type,
      paymentStatus,
      paymentMethod,
      cashierId,
      dateFrom,
      dateTo,
      search,
      page,
      limit,
    } = validated;

    const where: Prisma.OrderWhereInput = {};

    // Source Filter: Default to ONLINE when not specified (e.g. online delivery cockpit)
    // Pass source: 'ALL' to retrieve orders from all sources (e.g. invoices audit)
    const effectiveSource = source === undefined ? OrderSource.ONLINE : source;
    if (effectiveSource !== 'ALL') {
      where.source = effectiveSource as OrderSource;
    }

    // Type Filter (DINE_IN, TAKEAWAY, DELIVERY, or ALL)
    if (type && type !== 'ALL') {
      where.type = type as OrderType;
    }

    // Status Filter
    if (status && status !== 'ALL') {
      where.status = status as OrderStatus;
    }

    // Payment Status Filter
    if (paymentStatus && paymentStatus !== 'ALL') {
      where.paymentStatus = paymentStatus as PaymentStatus;
    }

    // Payment Method Filter
    if (paymentMethod && paymentMethod !== 'ALL') {
      where.paymentMethod = paymentMethod as PaymentMethod;
    }

    // Cashier Filter
    if (cashierId && cashierId !== 'ALL') {
      where.cashierId = cashierId;
    }

    // Date Range Filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const fromDate = dateFrom.includes('T') ? new Date(dateFrom) : new Date(`${dateFrom}T00:00:00.000Z`);
        where.createdAt.gte = fromDate;
      }
      if (dateTo) {
        const toDate = dateTo.includes('T') ? new Date(dateTo) : new Date(`${dateTo}T23:59:59.999Z`);
        where.createdAt.lte = toDate;
      }
    }

    // Branch Filter
    if (branchId && branchId !== 'ALL') {
      if (branchId === 'UNASSIGNED') {
        where.branchId = null;
      } else {
        where.branchId = branchId;
      }
    } else if (allowedBranchIds && allowedBranchIds.length > 0) {
      where.branchId = { in: allowedBranchIds };
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      where.branchId = 'NONE_ASSIGNED';
    }

    // Text Search
    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { orderNumber: { contains: q } },
        { customerPhone: { contains: q } },
        { customerName: { contains: q } },
        { tableName: { contains: q } },
      ];
    }

    const skip = (page - 1) * limit;

    const [
      total,
      orders,
      paidSummary,
      dineInSummary,
      takeawaySummary,
      deliverySummary,
      pendingCount,
    ] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              code: true,
            },
          },
          cashier: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          table: {
            select: {
              id: true,
              tableNumber: true,
              section: {
                select: {
                  nameAr: true,
                },
              },
            },
          },
          cashShift: {
            select: {
              id: true,
              status: true,
              openedAt: true,
              closedAt: true,
            },
          },
          payments: {
            select: {
              id: true,
              method: true,
              amountMinor: true,
              createdAt: true,
            },
          },
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              totalOrders: true,
              totalSpent: true,
            },
          },
          items: {
            include: {
              modifiers: true,
            },
          },
          driver: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              vehicleType: true,
            },
          },
        },
      }),
      prisma.order.aggregate({
        where: { ...where, paymentStatus: 'PAID' },
        _sum: { totalMinor: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { ...where, type: 'DINE_IN' },
        _sum: { totalMinor: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { ...where, type: 'TAKEAWAY' },
        _sum: { totalMinor: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { ...where, type: 'DELIVERY' },
        _sum: { totalMinor: true },
        _count: { id: true },
      }),
      prisma.order.count({
        where: { ...where, paymentStatus: 'PENDING' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const serializedOrders = orders.map((order) => ({
      ...order,
      taxRatePercent: Number(order.taxRatePercent),
    }));

    return {
      orders: serializedOrders,
      metrics: {
        totalOrders: total,
        totalSalesMinor: paidSummary._sum.totalMinor ?? 0,
        paidCount: paidSummary._count.id ?? 0,
        dineInSalesMinor: dineInSummary._sum.totalMinor ?? 0,
        dineInCount: dineInSummary._count.id ?? 0,
        takeawaySalesMinor: takeawaySummary._sum.totalMinor ?? 0,
        takeawayCount: takeawaySummary._count.id ?? 0,
        deliverySalesMinor: deliverySummary._sum.totalMinor ?? 0,
        deliveryCount: deliverySummary._count.id ?? 0,
        pendingCount,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }
}
