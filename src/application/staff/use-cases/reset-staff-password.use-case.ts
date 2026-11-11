import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ForbiddenError } from '../../../domain/shared/errors/domain-error';
import { PasswordService } from '../../../infrastructure/auth/password.service';
import { ResetStaffPasswordDto, resetStaffPasswordSchema } from '../dto/staff.dto';
import { SystemRole } from '../../../domain/staff/enums/role.enum';
import { UserSessionContext } from '../../../infrastructure/auth/branch-context.service';

export class ResetStaffPasswordUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async execute(dto: ResetStaffPasswordDto, actor?: UserSessionContext) {
    const validated = resetStaffPasswordSchema.parse(dto);

    const user = await this.db.user.findUnique({
      where: { id: validated.userId },
      include: { role: true, userBranches: true },
    });

    if (!user) {
      throw new NotFoundError('User', validated.userId);
    }

    if (actor) {
      if (user.role.name === SystemRole.SUPER_ADMIN && !actor.isSuperAdmin) {
        throw new ForbiddenError('فقط المسؤول العام يمكنه إعادة تعيين كلمة مرور مسؤول عام');
      }

      if (!actor.isSuperAdmin) {
        const targetBranches = user.userBranches.map((ub) => ub.branchId);
        const hasBranchOverlap = targetBranches.some((bId) =>
          actor.assignedBranchIds.includes(bId)
        );
        if (!hasBranchOverlap && targetBranches.length > 0) {
          throw new ForbiddenError('لا يمكنك إعادة تعيين كلمة مرور موظف خارج نطاق فروعك');
        }
      }
    }

    const passwordHash = await PasswordService.hash(validated.newPassword);

    await this.db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });

    return { id: user.id, username: user.username };
  }
}
