import { describe, it, expect, vi } from 'vitest';
import { placeOnlineOrderSchema, placeOnlineOrderItemSchema } from '../../src/application/ordering/dto/order.dto';
import { CreateEventBookingSchema } from '../../src/application/bookings/dto/event-booking.dto';
import { MatchOrCreateCustomerUseCase } from '../../src/application/customers/use-cases/match-or-create-customer.use-case';

describe('H6: Public Actions Validation and Customer Profile Protection', () => {
  describe('placeOnlineOrderSchema Constraints', () => {
    const validItem = {
      productId: crypto.randomUUID(),
      sizeId: crypto.randomUUID(),
      modifierIds: [],
      quantity: 1,
    };

    it('rejects order item quantity exceeding 50', () => {
      expect(() =>
        placeOnlineOrderItemSchema.parse({
          ...validItem,
          quantity: 51,
        })
      ).toThrow(/50/);
    });

    it('rejects more than 50 items in a single order', () => {
      const items = Array.from({ length: 51 }, () => ({ ...validItem }));
      expect(() =>
        placeOnlineOrderSchema.parse({
          type: 'TAKEAWAY',
          branchId: crypto.randomUUID(),
          customerName: 'محمد أحمد',
          customerPhone: '01012345678',
          items,
        })
      ).toThrow(/50/);
    });

    it('rejects customerName longer than 100 characters', () => {
      expect(() =>
        placeOnlineOrderSchema.parse({
          type: 'TAKEAWAY',
          branchId: crypto.randomUUID(),
          customerName: 'أ'.repeat(101),
          customerPhone: '01012345678',
          items: [validItem],
        })
      ).toThrow(/100/);
    });

    it('rejects customerNotes longer than 500 characters', () => {
      expect(() =>
        placeOnlineOrderSchema.parse({
          type: 'TAKEAWAY',
          branchId: crypto.randomUUID(),
          customerName: 'محمد أحمد',
          customerPhone: '01012345678',
          customerNotes: 'ن'.repeat(501),
          items: [validItem],
        })
      ).toThrow(/500/);
    });

    it('rejects deliveryNotes longer than 500 characters', () => {
      expect(() =>
        placeOnlineOrderSchema.parse({
          type: 'DELIVERY',
          customerName: 'محمد أحمد',
          customerPhone: '01012345678',
          area: 'المعادي',
          street: 'شارع 9',
          deliveryNotes: 'م'.repeat(501),
          items: [validItem],
        })
      ).toThrow(/500/);
    });

    it('rejects address fields (area, street) longer than 200 characters', () => {
      expect(() =>
        placeOnlineOrderSchema.parse({
          type: 'DELIVERY',
          customerName: 'محمد أحمد',
          customerPhone: '01012345678',
          area: 'ع'.repeat(201),
          street: 'شارع 9',
          items: [validItem],
        })
      ).toThrow(/200/);

      expect(() =>
        placeOnlineOrderSchema.parse({
          type: 'DELIVERY',
          customerName: 'محمد أحمد',
          customerPhone: '01012345678',
          area: 'المعادي',
          street: 'ش'.repeat(201),
          items: [validItem],
        })
      ).toThrow(/200/);
    });
  });

  describe('CreateEventBookingSchema Date Constraints', () => {
    it('rejects dates in the past', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);

      expect(() =>
        CreateEventBookingSchema.parse({
          customerName: 'عميل حجز',
          customerPhone: '01012345678',
          guestsCount: 5,
          branchId: crypto.randomUUID(),
          eventDate: pastDate.toISOString(),
        })
      ).toThrow();
    });

    it('rejects dates more than 1 year in the future', () => {
      const farFutureDate = new Date();
      farFutureDate.setFullYear(farFutureDate.getFullYear() + 2);

      expect(() =>
        CreateEventBookingSchema.parse({
          customerName: 'عميل حجز',
          customerPhone: '01012345678',
          guestsCount: 5,
          branchId: crypto.randomUUID(),
          eventDate: farFutureDate.toISOString(),
        })
      ).toThrow();
    });

    it('accepts valid future dates within one year', () => {
      const validFutureDate = new Date();
      validFutureDate.setDate(validFutureDate.getDate() + 14);

      const parsed = CreateEventBookingSchema.parse({
        customerName: 'عميل حجز',
        customerPhone: '01012345678',
        guestsCount: 5,
        branchId: crypto.randomUUID(),
        eventDate: validFutureDate.toISOString(),
      });
      expect(parsed.eventDate).toBe(validFutureDate.toISOString());
    });
  });

  describe('MatchOrCreateCustomerUseCase Public Call Safety', () => {
    it('does NOT mutate existing customer name or email when called from public path', async () => {
      const existingCustomer = {
        id: 'cust-123',
        phone: '+201012345678',
        fullName: 'الاسم الأصلي المعتمد',
        email: 'original@example.com',
        addresses: [],
      };

      const mockTx = {
        customer: {
          findUnique: vi.fn().mockResolvedValue(existingCustomer),
          update: vi.fn(),
          create: vi.fn(),
        },
        customerAddress: {
          create: vi.fn().mockResolvedValue({ id: 'addr-1' }),
        },
      };

      const useCase = new MatchOrCreateCustomerUseCase();
      // Public path call (allowEnrichProfile is undefined/false)
      const result = await useCase.execute(
        {
          fullName: 'اسم مزيف يحاول سرقة الحساب بالكامل',
          phone: '01012345678',
          email: 'hacker@malicious.com',
        },
        mockTx as unknown as import('@prisma/client').Prisma.TransactionClient
      );

      // Must NOT call update to change customer profile!
      expect(mockTx.customer.update).not.toHaveBeenCalled();
      expect(result.customer.fullName).toBe('الاسم الأصلي المعتمد');
      expect(result.customer.email).toBe('original@example.com');
    });
  });
});
