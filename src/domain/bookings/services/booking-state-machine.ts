import { BookingStatus } from '../enums/booking-status.enum';
import { ValidationError } from '../../shared/errors/domain-error';

export class BookingStateMachine {
  private static readonly VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
    [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
  };

  /**
   * Asserts whether a transition from currentStatus to nextStatus is permissible.
   */
  public static assertTransition(currentStatus: BookingStatus, nextStatus: BookingStatus): void {
    if (currentStatus === nextStatus) return;

    const allowed = this.VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new ValidationError(
        `لا يمكن تحويل حالة الحجز من "${currentStatus}" إلى "${nextStatus}"`
      );
    }
  }

  /**
   * Checks if transition is valid without throwing.
   */
  public static canTransition(currentStatus: BookingStatus, nextStatus: BookingStatus): boolean {
    if (currentStatus === nextStatus) return true;
    const allowed = this.VALID_TRANSITIONS[currentStatus];
    return allowed ? allowed.includes(nextStatus) : false;
  }
}
