import { prisma } from '../../../infrastructure/db/prisma';
import { CreateEventBookingInput, CreateEventBookingSchema } from '../dto/event-booking.dto';
import { PhoneNumber } from '../../../domain/customers/value-objects/phone-number';
import { ValidationError } from '../../../domain/shared/errors/domain-error';
import { BookingStatus } from '../../../domain/bookings/enums/booking-status.enum';
import { MatchOrCreateCustomerUseCase } from '../../customers/use-cases/match-or-create-customer.use-case';

export class CreateEventBookingUseCase {
  async execute(rawInput: CreateEventBookingInput): Promise<{
    id: string;
    whatsappUrl: string;
    booking: {
      id: string;
      customerName: string;
      customerPhone: string;
      guestsCount: number;
      eventDate: Date;
      branchNameAr: string;
      branchNameEn: string;
      status: string;
    };
  }> {
    const input = CreateEventBookingSchema.parse(rawInput);
    const normalizedPhone = PhoneNumber.fromString(input.customerPhone).value;

    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, isActive: true, deletedAt: null },
      select: { id: true, nameAr: true, nameEn: true, phone: true },
    });

    if (!branch) {
      throw new ValidationError('الفرع المختار غير متاح للحجز أو متوقف حالياً');
    }

    const eventDate = new Date(input.eventDate);

    // Centralized CRM Customer Matching (Business-level)
    let customerId: string | null = null;
    try {
      const matchedCustomer = await new MatchOrCreateCustomerUseCase().execute({
        fullName: input.customerName,
        phone: input.customerPhone,
      });
      customerId = matchedCustomer.customer.id;
    } catch {
      // safe fallback
    }

    const booking = await prisma.eventBooking.create({
      data: {
        customerName: input.customerName,
        customerPhone: normalizedPhone,
        guestsCount: input.guestsCount,
        eventDate,
        branchId: branch.id,
        status: BookingStatus.PENDING,
        notes: input.notes || null,
        ...(customerId ? { customerId } : {}),
      },
    });

    // Clean branch phone for WhatsApp (e.g., 01012345678 -> 201012345678)
    let waPhone = branch.phone.replace(/\D/g, '');
    if (waPhone.startsWith('0')) {
      waPhone = '2' + waPhone;
    } else if (!waPhone.startsWith('20') && waPhone.length === 10) {
      waPhone = '20' + waPhone;
    }

    const formattedDate = eventDate.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const messageText = `مرحباً إدارة مطعم ماسا (MASA Kitchen)،
أود الاستفسار وتأكيد حجز مناسبة وبوفيه خاص:
• الاسم: ${input.customerName}
• رقم الهاتف: ${normalizedPhone}
• تاريخ الفعالية: ${formattedDate}
• عدد الضيوف: ${input.guestsCount} فرد
• الفرع المفضل: ${branch.nameAr} (${branch.nameEn})
${input.notes ? `• تفاصيل إضافية: ${input.notes}\n` : ''}• رقم الطلب المسجل: ${booking.id.slice(0, 8).toUpperCase()}`;

    const whatsappUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`;

    return {
      id: booking.id,
      whatsappUrl,
      booking: {
        id: booking.id,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        guestsCount: booking.guestsCount,
        eventDate: booking.eventDate,
        branchNameAr: branch.nameAr,
        branchNameEn: branch.nameEn,
        status: booking.status,
      },
    };
  }
}
