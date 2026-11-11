import { describe, it, expect, vi } from 'vitest';
import { BookingStateMachine } from '../../src/domain/bookings/services/booking-state-machine';
import { BookingStatus } from '../../src/domain/bookings/enums/booking-status.enum';
import { UpdateBookingStatusUseCase } from '../../src/application/bookings/use-cases/update-booking-status.use-case';
import { ValidationError, ForbiddenError } from '../../src/domain/shared/errors/domain-error';
import { UserSessionContext } from '../../src/infrastructure/auth/branch-context.service';
import type { PrismaClient } from '@prisma/client';

const createSession = (overrides: Partial<UserSessionContext> = {}): UserSessionContext => ({
  userId: 'user-1',
  role: 'BRANCH_MANAGER',
  permissions: ['MANAGE_ORDERS'],
  assignedBranchIds: ['branch-1'],
  isSuperAdmin: false,
  ...overrides,
});

describe('B5: Booking Branch Scope and Lifecycle State Machine', () => {
  describe('BookingStateMachine', () => {
    it('allows valid progressive transitions', () => {
      expect(() =>
        BookingStateMachine.assertTransition(BookingStatus.PENDING, BookingStatus.CONFIRMED)
      ).not.toThrow();

      expect(() =>
        BookingStateMachine.assertTransition(BookingStatus.CONFIRMED, BookingStatus.COMPLETED)
      ).not.toThrow();
    });

    it('allows cancellation from PENDING or CONFIRMED', () => {
      expect(() =>
        BookingStateMachine.assertTransition(BookingStatus.PENDING, BookingStatus.CANCELLED)
      ).not.toThrow();

      expect(() =>
        BookingStateMachine.assertTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)
      ).not.toThrow();
    });

    it('rejects illegal transitions from terminal states', () => {
      expect(() =>
        BookingStateMachine.assertTransition(BookingStatus.CANCELLED, BookingStatus.COMPLETED)
      ).toThrow(ValidationError);

      expect(() =>
        BookingStateMachine.assertTransition(BookingStatus.COMPLETED, BookingStatus.PENDING)
      ).toThrow(ValidationError);
    });
  });

  describe('UpdateBookingStatusUseCase Branch Scoping', () => {
    it('throws ForbiddenError when manager tries to update booking in another branch', async () => {
      const bookingId = crypto.randomUUID();
      const mockBooking = {
        id: bookingId,
        branchId: 'branch-2', // Foreign branch
        status: BookingStatus.PENDING,
      };

      const mockPrisma = {
        eventBooking: {
          findUnique: vi.fn().mockResolvedValue(mockBooking),
          update: vi.fn(),
        },
      };

      const useCase = new UpdateBookingStatusUseCase(mockPrisma as unknown as PrismaClient);
      const managerSession = createSession({ assignedBranchIds: ['branch-1'] });

      await expect(
        useCase.execute(
          {
            bookingId,
            status: BookingStatus.CONFIRMED,
          },
          managerSession
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows manager to update booking in their own branch following state machine', async () => {
      const bookingId = crypto.randomUUID();
      const mockBooking = {
        id: bookingId,
        branchId: 'branch-1',
        status: BookingStatus.PENDING,
      };

      const mockPrisma = {
        eventBooking: {
          findUnique: vi.fn().mockResolvedValue(mockBooking),
          update: vi.fn().mockResolvedValue({
            ...mockBooking,
            status: BookingStatus.CONFIRMED,
            branch: { id: 'branch-1', code: 'B1', nameAr: 'فرع 1' },
          }),
        },
      };

      const useCase = new UpdateBookingStatusUseCase(mockPrisma as unknown as PrismaClient);
      const managerSession = createSession({ assignedBranchIds: ['branch-1'] });

      const result = await useCase.execute(
        {
          bookingId,
          status: BookingStatus.CONFIRMED,
        },
        managerSession
      );

      expect(result.status).toBe(BookingStatus.CONFIRMED);
    });
  });
});
