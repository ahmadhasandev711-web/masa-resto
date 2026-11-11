import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../../../domain/shared/errors/domain-error';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../../../domain/ordering/enums';
import { OrderStateMachineService } from '../../../domain/ordering/services/order-state-machine.service';
import { InventoryMovementType } from '../../../domain/inventory/enums';
import { OrderInventoryDeductionService } from '../../../infrastructure/inventory/order-inventory-deduction.service';
import { DocumentSequenceService } from '../../../domain/ordering/services/document-sequence.service';
import { PermissionCode } from '../../../domain/staff/enums/permission.enum';
import { UpdateOrderStatusDto, updateOrderStatusSchema } from '../dto/order.dto';

export interface UpdateOrderStatusContext {
  userId?: string;
  allowedBranchIds?: string[];
  userPermissions?: string[];
  isSuperAdmin?: boolean;
}

export class UpdateOrderStatusUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: UpdateOrderStatusDto & UpdateOrderStatusContext) {
    const validated = updateOrderStatusSchema.parse(input);

    const targetStatus = validated.nextStatus as OrderStatus;
    if (!Object.values(OrderStatus).includes(targetStatus)) {
      throw new ValidationError(`حالة الطلب غير صالحة: ${validated.nextStatus}`);
    }

    return this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: validated.orderId },
        select: {
          id: true,
          orderNumber: true,
          type: true,
          status: true,
          branchId: true,
          cashShiftId: true,
          paymentMethod: true,
          paymentStatus: true,
          totalMinor: true,
          customerId: true,
        },
      });

      if (!order) {
        throw new NotFoundError('الطلب', validated.orderId);
      }

      if (input.allowedBranchIds && order.branchId && !input.allowedBranchIds.includes(order.branchId)) {
        throw new ForbiddenError('غير مصرح لك بتعديل حالة طلب تابع لفرع آخر');
      }

      const currentStatus = order.status as OrderStatus;

      // Strict Domain State Machine Transition Check
      OrderStateMachineService.assertCanTransition({
        currentStatus,
        nextStatus: targetStatus,
        branchId: order.branchId,
        cancelReason: validated.cancelReason,
        orderType: order.type,
      });

      const isCancelling = targetStatus === OrderStatus.CANCELLED || targetStatus === OrderStatus.REJECTED;
      const wasPaid = order.paymentStatus === PaymentStatus.PAID;

      // D3: Voiding a PAID order requires explicit VOID_PAID_ORDER permission & mandatory reason
      if (isCancelling && wasPaid) {
        const canVoid =
          input.isSuperAdmin ||
          input.userPermissions?.includes(PermissionCode.VOID_PAID_ORDER);

        if (!canVoid) {
          throw new ForbiddenError('إلغاء أو استرجاع طلب مدفوع يتطلب صلاحية VOID_PAID_ORDER');
        }

        if (!validated.cancelReason || validated.cancelReason.trim().length < 5) {
          throw new ValidationError('يجب إدخال سبب واضح لإلغاء الطلب المدفوع (5 أحرف على الأقل)');
        }
      }

      const updateData: {
        status: OrderStatus;
        cancelReason?: string | null;
        paymentStatus?: PaymentStatus;
        cashShiftId?: string | null;
        cashierId?: string | null;
        kitchenStartedAt?: Date;
        updatedById?: string;
        deletedById?: string;
      } = {
        status: targetStatus,
      };

      if (targetStatus === OrderStatus.PREPARING) {
        updateData.kitchenStartedAt = new Date();
      }

      if (validated.cancelReason !== undefined) {
        updateData.cancelReason = validated.cancelReason?.trim() || null;
      }

      // Handling cash completion for takeaway/delivery at the branch counter
      if (
        (targetStatus === OrderStatus.DELIVERED || targetStatus === OrderStatus.COMPLETED) &&
        order.paymentMethod === PaymentMethod.CASH &&
        order.paymentStatus === PaymentStatus.PENDING
      ) {
        updateData.paymentStatus = PaymentStatus.PAID;

        // If cashier has an open shift, attach shift & create OrderPayment
        if (input.userId && order.branchId) {
          const cashierShift = await tx.cashShift.findFirst({
            where: {
              cashierId: input.userId,
              branchId: order.branchId,
              status: 'OPEN',
            },
            orderBy: { openedAt: 'desc' },
          });

          if (cashierShift) {
            updateData.cashShiftId = cashierShift.id;
            updateData.cashierId = input.userId;

            const existingPayment = await tx.orderPayment.findFirst({
              where: { orderId: order.id, method: PaymentMethod.CASH },
            });
            if (!existingPayment) {
              await tx.orderPayment.create({
                data: {
                  orderId: order.id,
                  method: PaymentMethod.CASH,
                  amountMinor: order.totalMinor,
                },
              });
            }
          }
        }
      }

      // If a paid order is cancelled or rejected, mark REFUNDED and generate ReturnInvoice
      if (isCancelling && wasPaid) {
        updateData.paymentStatus = PaymentStatus.REFUNDED;
      }

      // Optimistic concurrency update
      const updateResult = await tx.order.updateMany({
        where: { id: order.id, status: currentStatus },
        data: updateData,
      });

      if (updateResult.count === 0) {
        throw new ConflictError('تم تعديل حالة الطلب بالتزامن من مكان آخر');
      }

      // Generate ReturnInvoice and CashShiftMovement if paid order cancelled
      if (isCancelling && wasPaid) {
        const returnNumber = await DocumentSequenceService.getNextReturnNumber(tx);

        await tx.returnInvoice.create({
          data: {
            returnNumber,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchId: order.branchId,
            amountMinor: order.totalMinor,
            reason: validated.cancelReason?.trim() || 'إلغاء طلب مدفوع',
            createdById: validated.userId || null,
          },
        });

        // Record physical cash refund if paid in cash and operator has active shift
        if (order.paymentMethod === PaymentMethod.CASH && validated.userId && order.branchId) {
          const operatorShift = await tx.cashShift.findFirst({
            where: {
              cashierId: validated.userId,
              branchId: order.branchId,
              status: 'OPEN',
            },
            orderBy: { openedAt: 'desc' },
          });

          if (operatorShift) {
            await tx.cashShiftMovement.create({
              data: {
                cashShiftId: operatorShift.id,
                type: 'CASH_REFUND',
                amountMinor: order.totalMinor,
                reason: `مرتجع نقدي للطلب #${order.orderNumber} - ${validated.cancelReason}`,
                performedById: validated.userId,
              },
            });
          }
        }
      }

      // Deduct BOM Recipe inventory for online order if transitioning to PREPARING or beyond
      if (
        [
          OrderStatus.PREPARING,
          OrderStatus.READY_FOR_PICKUP,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DELIVERED,
        ].includes(targetStatus)
      ) {
        await OrderInventoryDeductionService.deductForOrder(
          order.id,
          tx,
          InventoryMovementType.SALE_ONLINE,
          validated.userId
        );
      }

      // Deduct Customer Lifetime Value (LTV) if order is cancelled or rejected
      if (isCancelling && order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalOrders: { decrement: 1 },
            totalSpent: { decrement: order.totalMinor },
          },
        });
      }

      // Inventory movements on cancellation:
      // If cancelled AFTER preparing, reclassify deducted movements as WASTE (never return to usable stock)
      if (isCancelling && [OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP, OrderStatus.OUT_FOR_DELIVERY].includes(currentStatus)) {
        await tx.inventoryMovement.updateMany({
          where: {
            referenceId: order.id,
            type: {
              in: [InventoryMovementType.SALE_ONLINE, InventoryMovementType.SALE_POS],
            },
          },
          data: {
            type: InventoryMovementType.WASTE,
            notes: `هالك ناتج عن إلغاء الطلب #${order.orderNumber}${validated.cancelReason ? ` - السبب: ${validated.cancelReason}` : ''}`,
          },
        });
      }

      const updated = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          branch: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              code: true,
            },
          },
        },
      });

      return {
        ...updated,
        taxRatePercent: Number(updated.taxRatePercent),
      };
    });
  }
}
