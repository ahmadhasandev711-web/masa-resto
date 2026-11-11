import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { ForbiddenError, UnauthorizedError } from '../../../domain/shared/errors/domain-error';
import { PasswordService } from '../../../infrastructure/auth/password.service';
import { JwtService } from '../../../infrastructure/auth/jwt.service';
import { BranchContextService } from '../../../infrastructure/auth/branch-context.service';
import { LoginDto, loginSchema } from '../dto/staff.dto';
import { SystemRole } from '../../../domain/staff/enums/role.enum';

export class AuthenticateStaffUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: LoginDto) {
    const validated = loginSchema.parse(input);

    const user = await this.db.user.findUnique({
      where: { username: validated.username },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        userBranches: {
          include: { branch: true },
        },
      },
    });

    if (!user || !user.isActive) {
      await PasswordService.burnComparisonTime(validated.password);
      throw new UnauthorizedError('اسم المستخدم أو كلمة المرور غير صحيحة أو الحساب غير مفعل');
    }

    const isPasswordValid = await PasswordService.compare(validated.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('اسم المستخدم أو كلمة المرور غير صحيحة أو الحساب غير مفعل');
    }

    const isSuperAdmin = user.role.name === SystemRole.SUPER_ADMIN;
    const permissions = user.role.permissions.map((p) => p.permission.code);
    const assignedBranchIds = user.userBranches.map((ub) => ub.branchId);

    // Resolve active branch scope
    let activeBranchId: string;
    try {
      activeBranchId = await BranchContextService.assertBranchAccess(
        {
          userId: user.id,
          role: user.role.name,
          permissions,
          assignedBranchIds,
          isSuperAdmin,
        },
        validated.branchId
      );
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        // Prevent password oracle: if password is valid but user has no branch access,
        // return the exact same generic error to prevent password confirmation leaks.
        throw new UnauthorizedError('اسم المستخدم أو كلمة المرور غير صحيحة أو الحساب غير مفعل');
      }
      throw err;
    }

    const token = await JwtService.sign({
      userId: user.id,
      role: user.role.name,
      branchId: activeBranchId,
      sessionVersion: user.sessionVersion,
      permissions,
      isSuperAdmin,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
        activeBranchId,
        assignedBranchIds,
        permissions,
      },
    };
  }
}
