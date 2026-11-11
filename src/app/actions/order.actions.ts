'use server';

import { revalidatePath } from 'next/cache';
import { PermissionCode } from '../../domain/staff/enums/permission.enum';
import { SessionService } from '../../infrastructure/auth/session.service';
import { BranchContextService } from '../../infrastructure/auth/branch-context.service';
import { prisma } from '../../infrastructure/db/prisma';
import {
  PlaceOnlineOrderDto,
  ListOrdersQueryInput,
  AssignOrderBranchDto,
  UpdateOrderStatusDto,
} from '../../application/ordering/dto/order.dto';
import { PlaceOnlineOrderUseCase } from '../../application/ordering/use-cases/place-online-order.use-case';
import { GetOrderTrackerUseCase } from '../../application/ordering/use-cases/get-order-tracker.use-case';
import { ListOrdersUseCase } from '../../application/ordering/use-cases/list-orders.use-case';
import { GetOrderDetailUseCase } from '../../application/ordering/use-cases/get-order-detail.use-case';
import { AssignOrderBranchUseCase } from '../../application/ordering/use-cases/assign-order-branch.use-case';
import { UpdateOrderStatusUseCase } from '../../application/ordering/use-cases/update-order-status.use-case';
import { GetOrdersMetricsUseCase } from '../../application/ordering/use-cases/get-orders-metrics.use-case';
import { headers } from 'next/headers';
import { ActionResult, toActionFailure } from './action-result';
import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/shared/errors/domain-error';
import { RateLimiter } from '../../infrastructure/security/rate-limiter';
import { RateLimiterKeys, RateLimitPolicies } from '../../infrastructure/security/rate-limiter-keys';

async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    const realIp = headerList.get('x-real-ip');
    return (forwardedFor ? forwardedFor.split(',')[0].trim() : realIp) || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

export async function placeOnlineOrderAction(input: PlaceOnlineOrderDto): Promise<ActionResult<{ orderNumber: string; trackingToken: string }>> {
  try {
    const ip = await getClientIp();
    const rateCheck = RateLimiter.check(
      RateLimiterKeys.CHECKOUT(ip),
      RateLimitPolicies.CHECKOUT.limit,
      RateLimitPolicies.CHECKOUT.windowMs
    );
    if (!rateCheck.allowed) {
      throw new ValidationError('تم تجاوز الحد المسموح للطلبات. يرجى الانتظار قليلاً قبل المحاولة مرة أخرى.');
    }

    const order = await new PlaceOnlineOrderUseCase().execute(input);
    return { success: true, data: { orderNumber: order.orderNumber, trackingToken: order.trackingToken } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getOrderTrackerAction(orderNumber: string): Promise<ActionResult<Awaited<ReturnType<GetOrderTrackerUseCase['execute']>>>> {
  try {
    const ip = await getClientIp();
    const rateCheck = RateLimiter.check(
      RateLimiterKeys.ORDER_TRACKER(ip),
      RateLimitPolicies.ORDER_TRACKER.limit,
      RateLimitPolicies.ORDER_TRACKER.windowMs
    );
    if (!rateCheck.allowed) {
      const waitSeconds = Math.ceil((rateCheck.resetAt - Date.now()) / 1000);
      throw new ValidationError(`تم تجاوز الحد المسموح للاستعلامات. يرجى المحاولة بعد ${waitSeconds} ثانية.`);
    }

    const tracker = await new GetOrderTrackerUseCase().execute(orderNumber);
    return { success: true, data: tracker };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function listOrdersAction(query?: ListOrdersQueryInput): Promise<ActionResult<Awaited<ReturnType<ListOrdersUseCase['execute']>>>> {
  try {
    const session = await SessionService.getCurrent();
    if (!session) throw new ForbiddenError('يرجى تسجيل الدخول');
    const hasPermission =
      session.isSuperAdmin ||
      session.permissions.includes(PermissionCode.MANAGE_ORDERS) ||
      session.permissions.includes(PermissionCode.VIEW_REPORTS);
    if (!hasPermission) throw new ForbiddenError('لا تملك صلاحية عرض قائمة الطلبات والفواتير');

    const canManageAll = session.isSuperAdmin || session.permissions.includes(PermissionCode.MANAGE_BRANCHES);

    const effectiveQuery: ListOrdersQueryInput = { ...query };
    if (!canManageAll) {
      // Force restriction to user's assigned branch
      effectiveQuery.branchId = session.assignedBranchIds[0] ?? 'NONE';
    }

    const result = await new ListOrdersUseCase().execute(effectiveQuery);
    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getOrderDetailAction(orderId: string): Promise<ActionResult<Awaited<ReturnType<GetOrderDetailUseCase['execute']>>>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_ORDERS);
    const result = await new GetOrderDetailUseCase().execute(orderId);

    const canManageAll = session.isSuperAdmin || session.permissions.includes(PermissionCode.MANAGE_BRANCHES);
    if (!canManageAll && result.branchId && !session.assignedBranchIds.includes(result.branchId)) {
      throw new ForbiddenError('غير مصرح لك باستعراض تفاصيل طلب تابع لفرع آخر');
    }

    return { success: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function assignOrderBranchAction(input: AssignOrderBranchDto): Promise<ActionResult<{ orderId: string; branchId: string }>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_ORDERS);
    const canManageAll = session.isSuperAdmin || session.permissions.includes(PermissionCode.MANAGE_BRANCHES);
    if (!canManageAll) {
      throw new ForbiddenError('غير مصرح لك بإسناد الطلبات بين الفروع (خاص بالإدارة المركزية)');
    }

    const updated = await new AssignOrderBranchUseCase().execute(input);
    revalidatePath('/admin/orders');
    return { success: true, data: { orderId: updated.id, branchId: input.branchId } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateOrderStatusAction(input: UpdateOrderStatusDto): Promise<ActionResult<{ orderId: string; status: string }>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_ORDERS);
    const canManageAll = session.isSuperAdmin || session.permissions.includes(PermissionCode.MANAGE_BRANCHES);

    if (!canManageAll) {
      const existingOrder = await prisma.order.findUnique({
        where: { id: input.orderId },
        select: { branchId: true },
      });
      if (!existingOrder) {
        throw new NotFoundError('الطلب', input.orderId);
      }
      if (existingOrder.branchId && !session.assignedBranchIds.includes(existingOrder.branchId)) {
        throw new ForbiddenError('غير مصرح لك بتعديل حالة طلب تابع لفرع آخر');
      }
    }

    const updated = await new UpdateOrderStatusUseCase().execute({
      ...input,
      userId: session.userId,
    });
    revalidatePath('/admin/orders');
    return { success: true, data: { orderId: updated.id, status: updated.status } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function getOrdersMetricsAction(branchId?: string): Promise<ActionResult<Awaited<ReturnType<GetOrdersMetricsUseCase['execute']>>>> {
  try {
    const session = await SessionService.requirePermission(PermissionCode.MANAGE_ORDERS);
    const canManageAll = session.isSuperAdmin || session.permissions.includes(PermissionCode.MANAGE_BRANCHES);

    const effectiveBranchId = !canManageAll ? (session.assignedBranchIds[0] ?? 'NONE') : branchId;
    const metrics = await new GetOrdersMetricsUseCase().execute(effectiveBranchId);
    return { success: true, data: metrics };
  } catch (error) {
    return toActionFailure(error);
  }
}
