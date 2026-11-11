import { describe, it, expect, vi } from 'vitest';
import { JwtService } from '../../src/infrastructure/auth/jwt.service';
import { SessionService } from '../../src/infrastructure/auth/session.service';
import { prisma } from '../../src/infrastructure/db/prisma';
import { cookies } from 'next/headers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('B3: Instant Session Invalidation via sessionVersion', () => {
  it('returns valid session when token sessionVersion matches database user sessionVersion', async () => {
    const userId = crypto.randomUUID();
    const token = await JwtService.sign({
      userId,
      role: 'CASHIER',
      sessionVersion: 3,
    });

    const mockCookies = {
      get: vi.fn().mockReturnValue({ value: token }),
    };
    vi.mocked(cookies).mockResolvedValue(
      mockCookies as unknown as Awaited<ReturnType<typeof cookies>>
    );

    const mockUser = {
      id: userId,
      sessionVersion: 3, // Matches token
      role: { name: 'CASHIER', permissions: [] },
      userBranches: [{ branchId: 'branch-1' }],
    };

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      mockUser as unknown as import('@prisma/client').User
    );

    const session = await SessionService.getCurrent();
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
  });

  it('immediately invalidates session and returns null when user sessionVersion has incremented', async () => {
    const userId = crypto.randomUUID();
    // Token issued with sessionVersion: 3
    const token = await JwtService.sign({
      userId,
      role: 'CASHIER',
      sessionVersion: 3,
    });

    const mockCookies = {
      get: vi.fn().mockReturnValue({ value: token }),
    };
    vi.mocked(cookies).mockResolvedValue(
      mockCookies as unknown as Awaited<ReturnType<typeof cookies>>
    );

    // Database user has bumped sessionVersion (e.g. after password reset -> 4)
    const mockUser = {
      id: userId,
      sessionVersion: 4, // Stale token!
      role: { name: 'CASHIER', permissions: [] },
      userBranches: [{ branchId: 'branch-1' }],
    };

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      mockUser as unknown as import('@prisma/client').User
    );

    const session = await SessionService.getCurrent();
    expect(session).toBeNull();
  });
});
