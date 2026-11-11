'use server';

import { revalidatePath } from 'next/cache';
import { CreateEventBookingInput, UpdateBookingStatusInput } from '../../application/bookings/dto/event-booking.dto';
import { CreateEventBookingUseCase } from '../../application/bookings/use-cases/create-event-booking.use-case';
import { UpdateBookingStatusUseCase } from '../../application/bookings/use-cases/update-booking-status.use-case';
import { SessionService } from '../../infrastructure/auth/session.service';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { ActionResult, toActionFailure } from './action-result';
import { getClientIp } from '../../infrastructure/security/client-ip';
import { RateLimiter } from '../../infrastructure/security/rate-limiter';
import { ValidationError } from '../../domain/shared/errors/domain-error';

export async function createEventBookingAction(
  input: CreateEventBookingInput
): Promise<ActionResult<{ id: string; whatsappUrl: string }>> {
  try {
    const ip = await getClientIp();
    const rateLimit = RateLimiter.check(`event-booking:${ip}`, 5, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      throw new ValidationError('تم تجاوز الحد المسموح من طلبات الحجز. يرجى الانتظار 10 دقائق ثم المحاولة مجدداً.');
    }

    const result = await new CreateEventBookingUseCase().execute(input);
    revalidatePath('/admin/bookings');
    return {
      success: true,
      data: { id: result.id, whatsappUrl: result.whatsappUrl },
    };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateBookingStatusAction(
  input: UpdateBookingStatusInput
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_ORDERS);
    await new UpdateBookingStatusUseCase().execute(input, session);
    revalidatePath('/admin/bookings');
    return {
      success: true,
      data: { success: true },
    };
  } catch (error) {
    return toActionFailure(error);
  }
}
