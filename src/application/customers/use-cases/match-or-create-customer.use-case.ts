import { Prisma } from '@prisma/client';
import { prisma } from '../../../infrastructure/db/prisma';
import { PhoneNumber } from '../../../domain/customers/value-objects/phone-number';
import { Customer } from '../../../domain/customers/entities/customer.entity';
import { CustomerAddress } from '../../../domain/customers/entities/customer-address.entity';
import { CustomerMatchingService } from '../../../domain/customers/services/customer-matching.service';
import { MatchOrCreateCustomerDto, matchOrCreateCustomerSchema } from '../dto/customer.dto';

export interface MatchOrCreateCustomerOptions {
  allowEnrichProfile?: boolean;
}

export class MatchOrCreateCustomerUseCase {
  public async execute(
    input: MatchOrCreateCustomerDto,
    tx?: Prisma.TransactionClient,
    options?: MatchOrCreateCustomerOptions
  ) {
    const validated = matchOrCreateCustomerSchema.parse(input);
    const phone = PhoneNumber.fromString(validated.phone);
    const client = tx ?? prisma;

    let customer = await client.customer.findUnique({
      where: { phone: phone.value },
      include: { addresses: true },
    });

    if (customer) {
      // 1. Only enrich name/email if explicitly permitted by authorized backoffice context (never on public paths)
      if (options?.allowEnrichProfile && CustomerMatchingService.shouldEnrichName(customer.fullName, validated.fullName)) {
        customer = await client.customer.update({
          where: { id: customer.id },
          data: {
            fullName: validated.fullName.trim(),
            email: validated.email ? validated.email.trim() : customer.email,
          },
          include: { addresses: true },
        });
      }

      // 2. Resolve address if provided
      let matchedAddress = null;
      if (validated.address) {
        const domainAddresses = customer.addresses.map((a) =>
          CustomerAddress.reconstitute({
            id: a.id,
            customerId: a.customerId,
            title: a.title,
            city: a.city,
            area: a.area,
            street: a.street,
            building: a.building,
            floor: a.floor,
            apartment: a.apartment,
            landmark: a.landmark,
            deliveryNotes: a.deliveryNotes,
            isDefault: a.isDefault,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          })
        );

        const existingMatch = CustomerMatchingService.matchExistingAddress(domainAddresses, validated.address);

        if (existingMatch) {
          matchedAddress = customer.addresses.find((a) => a.id === existingMatch.id) ?? null;
        } else {
          matchedAddress = await client.customerAddress.create({
            data: {
              customerId: customer.id,
              title: validated.address.title,
              city: validated.address.city,
              area: validated.address.area,
              street: validated.address.street,
              building: validated.address.building || null,
              floor: validated.address.floor || null,
              apartment: validated.address.apartment || null,
              landmark: validated.address.landmark || null,
              deliveryNotes: validated.address.deliveryNotes || null,
              isDefault: customer.addresses.length === 0,
            },
          });
        }
      }

      return { customer, address: matchedAddress };
    }

    // New Customer
    const domainCustomer = Customer.create({
      fullName: validated.fullName.trim(),
      phone,
      email: validated.email ? validated.email.trim() : null,
    });

    const newCustomer = await client.customer.create({
      data: {
        id: domainCustomer.id,
        phone: domainCustomer.phone.value,
        fullName: domainCustomer.fullName,
        email: domainCustomer.email,
        totalOrders: 0,
        totalSpent: 0,
        isActive: true,
      },
    });

    let newAddress = null;
    if (validated.address) {
      newAddress = await client.customerAddress.create({
        data: {
          customerId: newCustomer.id,
          title: validated.address.title,
          city: validated.address.city,
          area: validated.address.area,
          street: validated.address.street,
          building: validated.address.building || null,
          floor: validated.address.floor || null,
          apartment: validated.address.apartment || null,
          landmark: validated.address.landmark || null,
          deliveryNotes: validated.address.deliveryNotes || null,
          isDefault: true,
        },
      });
    }

    return { customer: newCustomer, address: newAddress };
  }
}
