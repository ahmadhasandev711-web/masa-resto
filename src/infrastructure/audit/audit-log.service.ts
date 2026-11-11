import { Prisma, PrismaClient } from '@prisma/client';

export interface AuditLogEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  branchId?: string | null;
}

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writeAuditLog(client: AuditClient, entry: AuditLogEntry): Promise<void> {
  if (!client?.auditLog?.create) {
    return;
  }
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      branchId: entry.branchId ?? null,
    },
  });
}