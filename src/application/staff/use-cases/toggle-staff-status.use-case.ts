import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../domain/shared/errors/domain-error';
import { SystemRole } from '../../../domain/staff/enums/role.enum';
import { UserSessionContext } from '../../../infrastructure/auth/branch-context.service';

export class ToggleStaffStatusUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async execute(userId: string, isActive: boolean, actor: UserSessionContext | string) {
    const actorUserId = typeof actor === 'string' ? actor : actor.userId;
    const actorSession = typeof actor === 'object' ? actor : null;

    if (userId === actorUserId) {
      throw new ValidationError('لا يمكنك إيقاف حسابك الشخصي المسجل به حالياً');
    }

    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // RBAC Anti-Escalation & Last SuperAdmin Guard (M3)
    if (actorSession) {
      if (user.role.name === SystemRole.SUPER_ADMIN && !actorSession.isSuperAdmin) {
        throw new ForbiddenError('فقط المسؤول العام يمكنه تغيير حالة حساب مسؤول عام');
      }

      if (!isActive && user.role.name === SystemRole.SUPER_ADMIN) {
        const activeSuperAdminCount = await this.db.user.count({
          where: { role: { name: SystemRole.SUPER_ADMIN }, isActive: true },
        });
        if (activeSuperAdminCount <= 1) {
          throw new ValidationError('لا يمكن تعطيل آخر مسؤول عام فعال في النظام');
        }
      }
    }

    return await this.db.user.update({
      where: { id: userId },
      data: {
        isActive,
        ...(!isActive ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: { id: true, username: true, isActive: true },
    });
  }
}
