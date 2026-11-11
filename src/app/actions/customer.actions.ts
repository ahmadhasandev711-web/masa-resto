'use server';

import { revalidatePath } from 'next/cache';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { SessionService } from '../../infrastructure/auth/session.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerAddressDto,
} from '../../application/customers/dto/customer.dto';
import { CreateCustomerUseCase } from '../../application/customers/use-cases/create-customer.use-case';
import { UpdateCustomerUseCase } from '../../application/customers/use-cases/update-customer.use-case';
import { SaveCustomerAddressUseCase } from '../../application/customers/use-cases/save-customer-address.use-case';
import { DeleteCustomerAddressUseCase } from '../../application/customers/use-cases/delete-customer-address.use-case';
import { ActionResult, toActionFailure } from './action-result';
import { assertDemoAllows } from '../../infrastructure/demo/demo-policy';

export async function createCustomerAction(input: CreateCustomerDto): Promise<ActionResult<{ id: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_CUSTOMERS);
    const result = await new CreateCustomerUseCase().execute(input);
    revalidatePath('/admin/customers');
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateCustomerAction(input: UpdateCustomerDto): Promise<ActionResult<{ id: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_CUSTOMERS);
    const result = await new UpdateCustomerUseCase().execute(input);
    revalidatePath('/admin/customers');
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function saveCustomerAddressAction(input: CustomerAddressDto): Promise<ActionResult<{ id: string }>> {
  try {
    await SessionService.requirePermission(PermissionCode.MANAGE_CUSTOMERS);
    const result = await new SaveCustomerAddressUseCase().execute(input);
    revalidatePath('/admin/customers');
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function deleteCustomerAddressAction(addressId: string, customerId: string): Promise<ActionResult<{ success: boolean }>> {
  try {
    assertDemoAllows('delete');
    await SessionService.requirePermission(PermissionCode.MANAGE_CUSTOMERS);
    await new DeleteCustomerAddressUseCase().execute(addressId, customerId);
    revalidatePath('/admin/customers');
    return { success: true, data: { success: true } };
  } catch (error) {
    return toActionFailure(error);
  }
}
