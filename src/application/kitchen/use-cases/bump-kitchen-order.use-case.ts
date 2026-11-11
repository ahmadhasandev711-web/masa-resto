import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { NotFoundError, ValidationError } from '../../../domain/shared/errors/domain-error';
import { OrderStatus, OrderType } from '../../../domain/ordering/enums';
import { OrderStateMachineService } from '../../../domain/ordering/services/order-state-machine.service';
import { BumpKitchenOrderDto, bumpKitchenOrderSchema } from '../dto/kitchen.dto';

export class BumpKitchenOrderUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: BumpKitchenOrderDto) {
    const validated = bumpKitchenOrderSchema.parse(input);

    const order = await this.db.order.findUnique({
      where: { id: validated.orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundError('الطلب', validated.orderId);
    }

    if (order.branchId && order.branchId !== validated.branchId) {
      throw new ValidationError('الطلب لا ينتمي إلى هذا الفرع التشغيلي');
    }

    const now = new Date();

    return this.db.$transaction(async (tx) => {
      // 1. Mark all remaining items as prepared
      await tx.orderItem.updateMany({
        where: { orderId: order.id, isPrepared: false },
        data: {
          isPrepared: true,
          preparedAt: now,
        },
      });

      // 2. Open Dine-In Tab: only mark items prepared and update kitchenCompletedAt.
      // FORBIDDEN to mark status=COMPLETED or paymentStatus=PAID on open tabs!
      if (order.isTabOpen) {
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            kitchenCompletedAt: now,
          },
          include: {
            items: {
              include: {
                modifiers: true,
              },
            },
            table: true,
            branch: true,
          },
        });

        return {
          id: updated.id,
          orderNumber: updated.orderNumber,
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          isTabOpen: updated.isTabOpen,
          kitchenCompletedAt: updated.kitchenCompletedAt?.toISOString() ?? null,
        };
      }

      // 3. Non-tab orders (Takeaway / Delivery):
      const currentStatus = order.status as OrderStatus;
      const nextStatus =
        order.type === OrderType.DELIVERY
          ? OrderStatus.READY_FOR_PICKUP
          : OrderStatus.COMPLETED;

      OrderStateMachineService.assertCanTransition({
        currentStatus,
        nextStatus,
        branchId: order.branchId,
        orderType: order.type,
      });

      // FORBIDDEN to set paymentStatus: PAID here.
      // Payment collection belongs strictly to the cashier/driver settlement.
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          kitchenCompletedAt: now,
        },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: true,
          branch: true,
        },
      });

      return {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        isTabOpen: updated.isTabOpen,
        kitchenCompletedAt: updated.kitchenCompletedAt?.toISOString() ?? null,
      };
    });
  }
}
