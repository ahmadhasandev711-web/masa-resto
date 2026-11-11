import { describe, it, expect } from 'vitest';
import { toActionFailure } from '../../src/app/actions/action-result';
import { ValidationError, NotFoundError } from '../../src/domain/shared/errors/domain-error';
import { z } from 'zod';

describe('H4: Error Masking and Hygiene in toActionFailure', () => {
  it('preserves DomainError messages and codes', () => {
    const domainErr = new ValidationError('رصيد المخزون لا يكفي');
    const result = toActionFailure(domainErr);

    expect(result.success).toBe(false);
    expect(result.error).toBe('رصيد المخزون لا يكفي');
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('preserves NotFoundError messages and codes', () => {
    const notFound = new NotFoundError('الطلب غير موجود');
    const result = toActionFailure(notFound);

    expect(result.success).toBe(false);
    expect(result.error).toBe(notFound.message);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('preserves Zod validation error messages with VALIDATION_ERROR code', () => {
    const schema = z.object({ email: z.string().email('البريد الإلكتروني غير صالح') });
    const parseResult = schema.safeParse({ email: 'not-an-email' });
    expect(parseResult.success).toBe(false);

    if (!parseResult.success) {
      const result = toActionFailure(parseResult.error);
      expect(result.success).toBe(false);
      expect(result.error).toBe('البريد الإلكتروني غير صالح');
      expect(result.code).toBe('VALIDATION_ERROR');
    }
  });

  it('masks raw Prisma errors and internal Error exceptions with a generic safe message', () => {
    // Simulating a raw Prisma error with internal DB schema leak
    const prismaError = new Error(
      'Invalid `prisma.order.create()` invocation:\nUnique constraint failed on the fields: (`order_number`)'
    );
    const result = toActionFailure(prismaError);

    expect(result.success).toBe(false);
    expect(result.code).toBe('INTERNAL_ERROR');
    // Must NOT leak table or field names
    expect(result.error).not.toContain('prisma');
    expect(result.error).not.toContain('order_number');
    expect(result.error).not.toContain('Unique constraint');
    expect(result.error).toBe('تعذر إتمام العملية. حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.');
  });
});
