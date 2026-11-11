import { OrderStatus } from '../../../domain/ordering/enums';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { Money } from '../../../domain/shared/value-objects/money';
import { ValidationError } from '../../../domain/shared/errors/domain-error';

export interface SalesAnalyticsFilter {
  branchId?: string;
  startDate: Date;
  endDate: Date;
}

export interface ChannelMetrics {
  count: number;
  totalMinor: number;
}

export interface HourlyDistributionItem {
  hour: number;
  label: string;
  count: number;
  totalMinor: number;
}

export interface DailyDistributionItem {
  date: string;
  label: string;
  count: number;
  totalMinor: number;
}

export interface PaymentBreakdownItem {
  method: string;
  count: number;
  totalMinor: number;
}

export interface SalesAnalyticsResult {
  currency: string;
  totalOrders: number;
  netSalesMinor: number;
  totalRevenueMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  serviceMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  averageOrderValueMinor: number;
  channels: {
    DINE_IN: ChannelMetrics;
    TAKEAWAY: ChannelMetrics;
    DELIVERY: ChannelMetrics;
  };
  hourly: HourlyDistributionItem[];
  daily: DailyDistributionItem[];
  payments: PaymentBreakdownItem[];
}

export class GetSalesAnalyticsUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(filter: SalesAnalyticsFilter): Promise<SalesAnalyticsResult> {
    if (filter.endDate < filter.startDate) {
      throw new ValidationError('تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية');
    }

    const diffMs = filter.endDate.getTime() - filter.startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 366) {
      throw new ValidationError('النطاق الزمني الأقصى للتقرير هو 366 يوماً');
    }

    const setting = await this.db.restaurantSetting.findFirst();
    const currency = setting?.currency || 'EGP';

    const whereClause = {
      createdAt: {
        gte: filter.startDate,
        lte: filter.endDate,
      },
      status: {
        notIn: [OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.PENDING],
      },
      isTabOpen: false,
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
    };

    // 1. Database-level aggregation (Avoid N+1, GR-5 & Rule 5.3)
    const [aggregates, channelGroups, paymentGroups, ordersTime] = await Promise.all([
      this.db.order.aggregate({
        where: whereClause,
        _count: { id: true },
        _sum: {
          totalMinor: true,
          subtotalMinor: true,
          taxMinor: true,
          serviceMinor: true,
          discountMinor: true,
          deliveryFeeMinor: true,
        },
      }),
      this.db.order.groupBy({
        by: ['type'],
        where: whereClause,
        _count: { id: true },
        _sum: { totalMinor: true },
      }),
      this.db.order.groupBy({
        by: ['paymentMethod'],
        where: whereClause,
        _count: { id: true },
        _sum: { totalMinor: true },
      }),
      this.db.order.findMany({
        where: whereClause,
        select: {
          createdAt: true,
          totalMinor: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const totalOrders = aggregates._count.id;
    const totalRevMoney = Money.fromMinor(aggregates._sum.totalMinor ?? 0, currency);
    const subtotalMoney = Money.fromMinor(aggregates._sum.subtotalMinor ?? 0, currency);
    const discountMoney = Money.fromMinor(aggregates._sum.discountMinor ?? 0, currency);
    const netSalesMoney = subtotalMoney.subtract(discountMoney);
    const taxMoney = Money.fromMinor(aggregates._sum.taxMinor ?? 0, currency);
    const serviceMoney = Money.fromMinor(aggregates._sum.serviceMinor ?? 0, currency);
    const deliveryFeeMoney = Money.fromMinor(aggregates._sum.deliveryFeeMinor ?? 0, currency);

    const aovMinor = totalOrders > 0
      ? Math.round(totalRevMoney.amount / totalOrders)
      : 0;

    // 2. Channel Breakdown via DB GroupBy
    const channels = {
      DINE_IN: { count: 0, totalMinor: 0 },
      TAKEAWAY: { count: 0, totalMinor: 0 },
      DELIVERY: { count: 0, totalMinor: 0 },
    };

    for (const group of channelGroups) {
      const orderType = group.type as keyof typeof channels;
      if (channels[orderType]) {
        channels[orderType].count = group._count.id;
        channels[orderType].totalMinor = group._sum.totalMinor ?? 0;
      }
    }

    // 3. Hourly Breakdown (00:00 - 23:00) using Africa/Cairo
    const hourlyMap = new Map<number, { count: number; totalMinor: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { count: 0, totalMinor: 0 });
    }

    const cairoHourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      hourCycle: 'h23',
    });

    const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // 4. Daily Breakdown using Africa/Cairo
    const dailyMap = new Map<string, { label: string; count: number; totalMinor: number }>();

    for (const order of ordersTime) {
      // Cairo Hour
      const hourStr = cairoHourFormatter.format(order.createdAt);
      const hour = parseInt(hourStr, 10);
      const currentH = hourlyMap.get(hour) || { count: 0, totalMinor: 0 };
      currentH.count += 1;
      currentH.totalMinor += order.totalMinor;
      hourlyMap.set(hour, currentH);

      // Cairo Day
      const dateKey = cairoDateFormatter.format(order.createdAt);
      const dayLabel = new Date(order.createdAt).toLocaleDateString('ar-EG', {
        timeZone: 'Africa/Cairo',
        weekday: 'short',
        month: 'numeric',
        day: 'numeric',
      });
      const currentD = dailyMap.get(dateKey) || { label: dayLabel, count: 0, totalMinor: 0 };
      currentD.count += 1;
      currentD.totalMinor += order.totalMinor;
      dailyMap.set(dateKey, currentD);
    }

    // 5. Payment Breakdown via DB GroupBy
    const payments: PaymentBreakdownItem[] = paymentGroups.map((group) => ({
      method: group.paymentMethod || 'UNKNOWN',
      count: group._count.id,
      totalMinor: group._sum.totalMinor ?? 0,
    }));

    const hourly: HourlyDistributionItem[] = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      count: data.count,
      totalMinor: data.totalMinor,
    }));

    const daily: DailyDistributionItem[] = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      label: data.label,
      count: data.count,
      totalMinor: data.totalMinor,
    }));

    return {
      currency,
      totalOrders,
      netSalesMinor: netSalesMoney.amount,
      totalRevenueMinor: totalRevMoney.amount,
      subtotalMinor: subtotalMoney.amount,
      taxMinor: taxMoney.amount,
      serviceMinor: serviceMoney.amount,
      discountMinor: discountMoney.amount,
      deliveryFeeMinor: deliveryFeeMoney.amount,
      averageOrderValueMinor: aovMinor,
      channels,
      hourly,
      daily,
      payments,
    };
  }
}
