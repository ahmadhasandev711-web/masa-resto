import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { UpdateBookingStatusInput, UpdateBookingStatusSchema } from '../dto/event-booking.dto';
import { NotFoundError, ForbiddenError } from '../../../domain/shared/errors/domain-error';
import { BookingStateMachine } from '../../../domain/bookings/services/booking-state-machine';
import { BookingStatus } from '../../../domain/bookings/enums/booking-status.enum';
import { UserSessionContext } from '../../../infrastructure/auth/branch-context.service';

export class UpdateBookingStatusUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(rawInput: UpdateBookingStatusInput, actor?: UserSessionContext) {
    const input = UpdateBookingStatusSchema.parse(rawInput);

    const booking = await this.db.eventBooking.findUnique({
      where: { id: input.bookingId },
    });

    if (!booking) {
      throw new NotFoundError('EventBooking', input.bookingId);
    }

    // Branch Scoping Guard (L2)
    if (actor) {
      if (booking.branchId && !actor.isSuperAdmin && !actor.assignedBranchIds.includes(booking.branchId)) {
        throw new ForbiddenError('غير مصرح لك بتعديل حجز يتبع فرعاً آخر');
      }
    }

    // Lifecycle State Machine Guard
    BookingStateMachine.assertTransition(booking.status as BookingStatus, input.status as BookingStatus);

    const updated = await this.db.eventBooking.update({
      where: { id: input.bookingId },
      data: { status: input.status },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            nameAr: true,
          },
        },
      },
    });

    return updated;
  }
}
