import { OrderStatus, OrderType } from '../enums';
import { ValidationError } from '../../shared/errors/domain-error';

export interface TransitionValidationParams {
  currentStatus: OrderStatus;
  nextStatus: OrderStatus;
  branchId?: string | null;
  cancelReason?: string | null;
  driverId?: string | null;
  orderType?: OrderType | string | null;
}

export class OrderStateMachineService {
  /**
   * Deterministic State Transition Matrix for Order Lifecycle (GR-6.2)
   */
  private static readonly VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.REJECTED],
    [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
    [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
    [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.REJECTED]: [],
  };

  /**
   * Returns list of allowed next statuses from current status.
   */
  public static getAllowedTransitions(currentStatus: OrderStatus): readonly OrderStatus[] {
    return this.VALID_TRANSITIONS[currentStatus] ?? [];
  }

  /**
   * Checks if status is terminal (cannot transition any further).
   */
  public static isTerminalStatus(status: OrderStatus): boolean {
    const nextTransitions = this.VALID_TRANSITIONS[status];
    return !nextTransitions || nextTransitions.length === 0;
  }

  /**
   * Validates if transition is allowed without throwing error.
   */
  public static canTransition(params: TransitionValidationParams): {
    allowed: boolean;
    reason?: string;
  } {
    const { currentStatus, nextStatus, branchId, cancelReason } = params;

    if (currentStatus === nextStatus) {
      return { allowed: false, reason: 'الطلب بالفعل في هذه الحالة' };
    }

    if (this.isTerminalStatus(currentStatus)) {
      return {
        allowed: false,
        reason: `لا يمكن تغيير حالة الطلب بعد وصوله إلى حالة نهائية (${currentStatus})`,
      };
    }

    const allowedNext = this.VALID_TRANSITIONS[currentStatus];
    if (!allowedNext.includes(nextStatus)) {
      return {
        allowed: false,
        reason: `الانتقال من حالة ${currentStatus} إلى ${nextStatus} غير مسموح به في مسار دورة حياة الطلب`,
      };
    }

    // Business rule: Moving to PREPARING requires an assigned branch
    if (nextStatus === OrderStatus.PREPARING && !branchId) {
      return {
        allowed: false,
        reason: 'لا يمكن بدء تجهيز الطلب في المطبخ قبل إسناده لفرع تشغيلي محدد',
      };
    }

    // Business rule: CANCELLED or REJECTED requires a non-empty reason
    if (
      (nextStatus === OrderStatus.CANCELLED || nextStatus === OrderStatus.REJECTED) &&
      (!cancelReason || cancelReason.trim().length === 0)
    ) {
      return {
        allowed: false,
        reason: 'يجب توضيح سبب الإلغاء أو الرفض للتوثيق والتدقيق',
      };
    }

    return { allowed: true };
  }

  /**
   * Asserts transition is valid and throws ValidationError if invalid.
   */
  public static assertCanTransition(params: TransitionValidationParams): void {
    const check = this.canTransition(params);
    if (!check.allowed) {
      throw new ValidationError(check.reason || 'انتقال حالة الطلب غير مسموح');
    }
  }
}
