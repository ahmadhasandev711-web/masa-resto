import { describe, it, expect } from 'vitest';
import { isDbAvailable } from '../test-db-helper';
import { AuthenticateStaffUseCase } from '../../src/application/staff/use-cases/authenticate-staff.use-case';
import { UnauthorizedError } from '../../src/domain/shared/errors/domain-error';
import { JwtService } from '../../src/infrastructure/auth/jwt.service';

describe.skipIf(!isDbAvailable)('Staff Authentication Use Case (Requires MySQL)', () => {
  const authUseCase = new AuthenticateStaffUseCase();

  it('authenticates seeded super admin and returns JWT with branch context', async () => {
    const result = await authUseCase.execute({
      username: 'admin',
      password: '123456',
    });

    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('admin');
    expect(result.user.role).toBe('SUPER_ADMIN');
    expect(result.user.activeBranchId).toBeDefined();
    expect(result.user.permissions.length).toBeGreaterThan(0);

    // Verify token can be decoded by JwtService
    const decoded = await JwtService.verify(result.token);
    expect(decoded.userId).toBe(result.user.id);
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  it('rejects invalid password with UnauthorizedError', async () => {
    await expect(
      authUseCase.execute({
        username: 'admin',
        password: 'wrong_password_123',
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects non-existent username with UnauthorizedError', async () => {
    await expect(
      authUseCase.execute({
        username: 'non_existent_user_999',
        password: 'password123',
      })
    ).rejects.toThrow(UnauthorizedError);
  });
});