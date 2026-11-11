import { describe, it, expect, vi } from 'vitest';
import { AuthenticateStaffUseCase } from '../../src/application/staff/use-cases/authenticate-staff.use-case';
import { UnauthorizedError } from '../../src/domain/shared/errors/domain-error';
import { PasswordService } from '../../src/infrastructure/auth/password.service';

describe('L1: Password Oracle Leak Prevention in AuthenticateStaffUseCase', () => {
  it('throws generic UnauthorizedError when password is correct but user has no branch assignment', async () => {
    const passwordHash = await PasswordService.hash('correct_password_123');

    const userWithNoBranch = {
      id: crypto.randomUUID(),
      username: 'branchless_cashier',
      passwordHash,
      isActive: true,
      role: {
        name: 'CASHIER',
        permissions: [],
      },
      userBranches: [], // No branches assigned
    };

    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(userWithNoBranch),
      },
      branch: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const authUseCase = new AuthenticateStaffUseCase(mockPrisma as unknown as import('@prisma/client').PrismaClient);

    // Must throw UnauthorizedError, NOT ForbiddenError
    await expect(
      authUseCase.execute({
        username: 'branchless_cashier',
        password: 'correct_password_123',
      })
    ).rejects.toThrow(UnauthorizedError);

    await expect(
      authUseCase.execute({
        username: 'branchless_cashier',
        password: 'correct_password_123',
      })
    ).rejects.toThrow('اسم المستخدم أو كلمة المرور غير صحيحة أو الحساب غير مفعل');
  });
});
