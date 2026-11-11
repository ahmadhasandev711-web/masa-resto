import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/db/prisma';
import { ModifierGroupInput, modifierGroupSchema, toMinorUnits } from '../dto/catalog.dto';

export class SaveModifierGroupUseCase {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  public async execute(input: ModifierGroupInput) {
    const value = modifierGroupSchema.parse(input);
    const { modifiers, ...fields } = value;
    const baseData = {
      nameAr: fields.nameAr,
      nameEn: fields.nameEn,
      minSelect: fields.minSelect,
      maxSelect: fields.maxSelect,
    };

    return this.db.$transaction(async (transaction) => {
      if (fields.id) {
        const groupId = fields.id;
        const existingModifiers = await transaction.modifier.findMany({
          where: { groupId },
        });
        const existingModifierIds = new Set(existingModifiers.map((m) => m.id));
        const incomingModifierIds = new Set(modifiers.map((m) => m.id).filter(Boolean) as string[]);

        // 1. Upsert incoming modifiers
        for (let sortOrder = 0; sortOrder < modifiers.length; sortOrder++) {
          const mod = modifiers[sortOrder];
          if (mod.id && existingModifierIds.has(mod.id)) {
            await transaction.modifier.update({
              where: { id: mod.id },
              data: {
                nameAr: mod.nameAr,
                nameEn: mod.nameEn,
                priceDelta: toMinorUnits(mod.price),
                sortOrder,
                isActive: true,
              },
            });
          } else {
            await transaction.modifier.create({
              data: {
                groupId,
                nameAr: mod.nameAr,
                nameEn: mod.nameEn,
                priceDelta: toMinorUnits(mod.price),
                sortOrder,
                isActive: true,
              },
            });
          }
        }

        // 2. Mark removed modifiers as isActive = false (NEVER delete)
        const removedModifierIds = existingModifiers
          .filter((m) => !incomingModifierIds.has(m.id))
          .map((m) => m.id);
        if (removedModifierIds.length > 0) {
          await transaction.modifier.updateMany({
            where: { id: { in: removedModifierIds } },
            data: { isActive: false },
          });
        }

        // 3. Update group fields
        await transaction.modifierGroup.update({
          where: { id: groupId },
          data: baseData,
        });

        return transaction.modifierGroup.findUniqueOrThrow({
          where: { id: groupId },
          include: { modifiers: true },
        });
      }

      // Creating new modifier group
      return transaction.modifierGroup.create({
        data: {
          ...baseData,
          modifiers: {
            create: modifiers.map((modifier, sortOrder) => ({
              nameAr: modifier.nameAr,
              nameEn: modifier.nameEn,
              priceDelta: toMinorUnits(modifier.price),
              sortOrder,
              isActive: true,
            })),
          },
        },
        include: { modifiers: true },
      });
    });
  }
}
