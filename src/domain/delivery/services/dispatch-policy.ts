import { ValidationError } from '../../shared/errors/domain-error';
import { OrderStatus } from '../../ordering/enums';

/** M14: a driver can only be dispatched once the kitchen has marked the order ready. */
export function assertReadyForDispatch(orderNumber: string, status: string): void {
  if (status !== OrderStatus.READY_FOR_PICKUP) {
    throw new ValidationError(`لا يمكن إسناد الطلب ${orderNumber} إلا بعد أن يصبح جاهزاً للاستلام`);
  }
}