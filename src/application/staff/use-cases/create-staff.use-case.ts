import { prisma } from '../../../infrastructure/db/prisma';
import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, ForbiddenError } from '../../../domain/shared/errors/domain-error';
import { PasswordService } from '../../../infrastructure/auth/password.service';
import { CreateStaffDto, createStaffSchema } from '../dto/staff.dto';
import { User } from '../../../domain/staff/entities/user.entity';
import { SystemRole } from '../../../domain/staff/enums/role.enum';
import { UserSessionContext } from '../../../infrastructure/auth/branch-context.service';

export class CreateStaffUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async execute(input: CreateStaffDto, actor?: UserSessionContext) {
    const validated = createStaffSchema.parse(input);

    const existing = await this.db.user.findUnique({
      where: { username: validated.username },
    });

    if (existing) {
      throw new ConflictError(`User with username '${validated.username}' already exists`);
    }

    const role = await this.db.role.findUnique({
      where: { id: validated.roleId },
    });

    if (!role) {
      throw new NotFoundError('Role', validated.roleId);
    }

    // RBAC Anti-Escalation Guards (M3)
    if (actor) {
      if (role.name === SystemRole.SUPER_ADMIN && !actor.isSuperAdmin) {
        throw new ForbiddenError('فقط المسؤول العام يمكنه إنشاء حساب مسؤول عام');
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

    const passwordHash = await PasswordService.hash(validated.password);

    const domainUser = User.create({
      username: validated.username,
      fullName: validated.fullName,
      phone: validated.phone,
      passwordHash,
      roleId: validated.roleId,
      assignedBranchIds: validated.branchIds,
    });

    return await this.db.user.create({
      data: {
        id: domainUser.id,
        username: domainUser.username,
        fullName: domainUser.fullName,
        phone: domainUser.phone,
        passwordHash: domainUser.passwordHash,
        roleId: domainUser.roleId,
        isActive: domainUser.isActive,
        userBranches: {
          create: domainUser.assignedBranchIds.map((branchId, index) => ({
            branchId,
            isDefault: index === 0,
          })),
        },
      },
      include: {
        role: true,
        userBranches: {
          include: { branch: true },
        },
      },
    });
  }
}
