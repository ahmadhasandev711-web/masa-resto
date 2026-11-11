import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../domain/shared/errors/domain-error';
import { UpdateStaffDto, updateStaffSchema } from '../dto/staff.dto';
import { SystemRole } from '../../../domain/staff/enums/role.enum';
import { UserSessionContext } from '../../../infrastructure/auth/branch-context.service';

export class UpdateStaffUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async execute(dto: UpdateStaffDto, actor?: UserSessionContext) {
    const validated = updateStaffSchema.parse(dto);

    const user = await this.db.user.findUnique({
      where: { id: validated.userId },
      include: { role: true, userBranches: true },
    });

    if (!user) {
      throw new NotFoundError('User', validated.userId);
    }

    // Role verification
    const role = await this.db.role.findUnique({
      where: { id: validated.roleId },
    });
    if (!role) {
      throw new NotFoundError('Role', validated.roleId);
    }

    // Anti-Escalation & Last SuperAdmin Demotion Guards (M3)
    if (actor) {
      const isTargetSuperAdmin = user.role.name === SystemRole.SUPER_ADMIN;
      const isNewSuperAdmin = role.name === SystemRole.SUPER_ADMIN;

      if ((isTargetSuperAdmin || isNewSuperAdmin) && !actor.isSuperAdmin) {
        throw new ForbiddenError('فقط المسؤول العام يمكنه تعديل حسابات أو أدوار المسؤولين العامين');
      }

      if (isTargetSuperAdmin && !isNewSuperAdmin) {
        const activeSuperAdminCount = await this.db.user.count({
          where: { role: { name: SystemRole.SUPER_ADMIN }, isActive: true },
        });
        if (activeSuperAdminCount <= 1) {
          throw new ValidationError('لا يمكن تخفيض رتبة آخر مسؤول عام فعال في النظام');
        }
      }

      if (!actor.isSuperAdmin) {
        const unauthorizedBranches = validated.branchIds.filter(
          (bId) => !actor.assignedBranchIds.includes(bId)
        );
        if (unauthorizedBranches.length > 0) {
          throw new ForbiddenError('لا يمكنك تعيين موظفين على فروع خارج نطاق فروعك');
        }
      }
    }

    const roleChanged = user.roleId !== validated.roleId;

    // Atomic transaction: update user info & sync assigned branches
    return await this.db.$transaction(async (tx) => {
      // 1. Delete removed branch assignments
      await tx.userBranch.deleteMany({
        where: {
          userId: user.id,
          branchId: { notIn: validated.branchIds },
        },
      });

      // 2. Upsert existing/new branch assignments
      for (let i = 0; i < validated.branchIds.length; i++) {
        const bId = validated.branchIds[i];
        await tx.userBranch.upsert({
          where: {
            userId_branchId: {
              userId: user.id,
              branchId: bId,
            },
          },
          update: { isDefault: i === 0 },
          create: {
            userId: user.id,
            branchId: bId,
            isDefault: i === 0,
          },
        });
      }

      // 3. Update user profile (bump sessionVersion if role changed)
      return await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: validated.fullName,
          phone: validated.phone,
          roleId: validated.roleId,
          ...(roleChanged ? { sessionVersion: { increment: 1 } } : {}),
        },
        include: {
          role: { select: { id: true, name: true, description: true } },
          userBranches: {
            select: {
              isDefault: true,
              branch: { select: { id: true, code: true, nameAr: true } },
            },
          },
        },
      });
    });
  }
}
