import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { NotFoundError, ValidationError, ConflictError } from '../../../domain/shared/errors/domain-error';
import { OrderStatus } from '../../../domain/ordering/enums';
import { DriverStatus } from '../../../domain/delivery/enums';
import { DriverSettlementCalculatorService } from '../../../domain/delivery/services/driver-settlement-calculator.service';
import { DocumentSequenceService } from '../../../domain/ordering/services/document-sequence.service';
import { SettleDriverCashDto, settleDriverCashSchema } from '../dto/delivery.dto';

export class SettleDriverCashUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: SettleDriverCashDto) {
    const validated = settleDriverCashSchema.parse(input);

    return this.db.$transaction(async (tx) => {
      // 1. Lock driver row with FOR UPDATE to prevent concurrent settlements (H1)
      await tx.$queryRaw(
        Prisma.sql`SELECT id, status, branch_id FROM delivery_drivers WHERE id = ${validated.driverId} FOR UPDATE`
      );

      const driver = await tx.deliveryDriver.findUnique({
        where: { id: validated.driverId },
        include: { branch: true },
      });

      if (!driver || driver.branchId !== validated.branchId) {
        throw new NotFoundError('الطيار', validated.driverId);
      }

      const cashier = await tx.user.findUnique({
        where: { id: validated.cashierId },
      });
      if (!cashier) {
        throw new NotFoundError('الموظف المستلم', validated.cashierId);
      }

      // 2. Resolve receiver's active cash shift (mandatory for CASH_IN)
      const receiverShift = await tx.cashShift.findFirst({
        where: {
          cashierId: cashier.id,
          branchId: validated.branchId,
          status: 'OPEN',
        },
        orderBy: { openedAt: 'desc' },
      });

      if (!receiverShift) {
        throw new ValidationError(
          'يجب أن يمتلك الموظف المستلم وردية نقدية مفتوحة في نفس الفرع لتسجيل التوريد النقدي'
        );
      }

      // 3. Read unsettled delivered orders INSIDE the transaction
      const deliveredOrders = await tx.order.findMany({
        where: {
          driverId: driver.id,
          status: OrderStatus.DELIVERED,
          driverSettlementId: null,
        },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          totalMinor: true,
          paymentMethod: true,
          paymentStatus: true,
          driverId: true,
          deliveredAt: true,
          driverSettlementId: true,
        },
      });

      if (deliveredOrders.length === 0) {
        throw new ValidationError(`لا توجد أي طلبات مسلّمة بانتظار التسوية للطيار ${driver.fullName}`);
      }

      const restaurantSetting = await tx.restaurantSetting.findFirst();
      const currency = restaurantSetting?.currency || 'EGP';

      const calculation = DriverSettlementCalculatorService.calculate(
        deliveredOrders,
        currency
      );

      // 4. Generate unique atomic settlement number via DocumentSequenceService (C1/H3)
      const now = new Date();
      const settlementNumber = await DocumentSequenceService.getNextSettlementNumber(tx, now);

      // 5. Create settlement record
      const settlement = await tx.driverSettlement.create({
        data: {
          settlementNumber,
          branchId: validated.branchId,
          driverId: driver.id,
          cashierId: cashier.id,
          cashShiftId: receiverShift.id,
          totalOrdersCount: calculation.totalOrdersCount,
          totalCollectedMinor: calculation.totalCollectedCash.amount,
          notes: validated.notes?.trim() || null,
          settledAt: now,
        },
      });

      // 6. Ensure OrderPayment records exist for cash orders
      for (const order of deliveredOrders) {
        if (order.paymentMethod === 'CASH') {
          const existingPayment = await tx.orderPayment.findFirst({
            where: { orderId: order.id, method: 'CASH' },
          });
          if (!existingPayment) {
            await tx.orderPayment.create({
              data: {
                orderId: order.id,
                method: 'CASH',
                amountMinor: order.totalMinor,
              },
            });
          }
        }
      }

      // 7. Atomic conditional update: verify all orders are still unsettled
      const updateResult = await tx.order.updateMany({
        where: {
          id: { in: calculation.orderIds },
          driverSettlementId: null,
        },
        data: {
          driverSettlementId: settlement.id,
          cashierId: cashier.id,
        },
      });

      if (updateResult.count !== calculation.orderIds.length) {
        throw new ConflictError('تم تسوية بعض طلبات هذا الطيار بالتزامن من محطة أخرى');
      }

      // 8. Financial Bridge: Create CASH_IN CashShiftMovement in receiver's open shift
      if (calculation.totalCollectedCash.amount > 0) {
        await tx.cashShiftMovement.create({
          data: {
            cashShiftId: receiverShift.id,
            type: 'CASH_IN',
            amountMinor: calculation.totalCollectedCash.amount,
            reason: `توريد عهدة دليفري من كابتن ${driver.fullName} - تسوية رقم ${settlementNumber}`,
            performedById: cashier.id,
          },
        });
      }

      // 9. Update driver availability status if no orders out for delivery
      const remainingOrdersCount = await tx.order.count({
        where: {
          driverId: driver.id,
          status: OrderStatus.OUT_FOR_DELIVERY,
        },
      });

      if (remainingOrdersCount === 0) {
        await tx.deliveryDriver.update({
          where: { id: driver.id },
          data: { status: DriverStatus.AVAILABLE },
        });
      }

      const currencySymbol = restaurantSetting?.currencySymbol || 'ج.م';

      return {
        settlement: {
          id: settlement.id,
          settlementNumber: settlement.settlementNumber,
          settledAt: settlement.settledAt,
          totalOrdersCount: settlement.totalOrdersCount,
          totalCollectedMinor: settlement.totalCollectedMinor,
          notes: settlement.notes,
        },
        driver: {
          id: driver.id,
          fullName: driver.fullName,
          phone: driver.phone,
          branchNameAr: driver.branch?.nameAr ?? '',
        },
        cashier: {
          id: cashier.id,
          fullName: cashier.fullName,
        },
        orders: deliveredOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          totalMinor: o.totalMinor,
          paymentMethod: o.paymentMethod,
        })),
        summary: {
          totalOrdersCount: calculation.totalOrdersCount,
          codOrdersCount: calculation.codOrdersCount,
          prepaidOrdersCount: calculation.prepaidOrdersCount,
          totalCollectedCashMinor: calculation.totalCollectedCash.amount,
          currency,
          currencySymbol,
        },
      };
    });
  }
}
