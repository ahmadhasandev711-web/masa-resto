import { z } from 'zod';
import { BookingStatus } from '../../../domain/bookings/enums/booking-status.enum';

export const CreateEventBookingSchema = z.object({
  customerName: z.string().trim().min(2, 'الاسم يجب أن يكون حرفين على الأقل').max(100, 'الاسم يجب ألا يتجاوز 100 حرف'),
  customerPhone: z.string().trim().min(8, 'رقم الهاتف غير صالح').max(20, 'رقم الهاتف يجب ألا يتجاوز 20 حرف'),
  guestsCount: z.coerce.number().int().min(2, 'الحد الأدنى لعدد الأفراد فردان').max(1000, 'الحد الأقصى لعدد الأفراد 1000 فرد'),
  eventDate: z.string().min(1, 'تاريخ المناسبة مطلوب').refine((val) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const minDate = new Date(now.getTime() - 15 * 60 * 1000);
    const maxDate = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
    return d >= minDate && d <= maxDate;
  }, 'تاريخ المناسبة يجب أن يكون تاريخاً صالحاً ومستقبلياً خلال عام من اليوم'),
  branchId: z.string().uuid('معرف الفرع غير صالح'),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CreateEventBookingInput = z.infer<typeof CreateEventBookingSchema>;

export const UpdateBookingStatusSchema = z.object({
  bookingId: z.string().uuid(),
  status: z.nativeEnum(BookingStatus),
});

export type UpdateBookingStatusInput = z.infer<typeof UpdateBookingStatusSchema>;
