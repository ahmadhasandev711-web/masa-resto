import { DomainError } from '../../domain/shared/errors/domain-error';
import { ZodError } from 'zod';
import { AppLogger } from '../../infrastructure/logging/logger';

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

export function toActionFailure(error: unknown): ActionResult<never> {
  AppLogger.error('Action execution failed', error);

  if (error instanceof ZodError) {
    return {
      success: false,
      error: error.issues[0]?.message ?? 'تحقق من البيانات المدخلة',
      code: 'VALIDATION_ERROR',
    };
  }

  if (error instanceof DomainError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  // Any other error (Prisma, internal runtime errors, unhandled exceptions)
  // Must NEVER leak raw error.message to the client
  return {
    success: false,
    error: 'تعذر إتمام العملية. حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.',
    code: 'INTERNAL_ERROR',
  };
}
