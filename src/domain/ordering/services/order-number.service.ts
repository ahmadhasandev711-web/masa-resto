import { Prisma } from '@prisma/client';
import { DocumentSequenceService } from './document-sequence.service';

export class OrderNumberService {
  /**
   * Generates the next sequential human-friendly order number for physical/POS/Dine-in operations.
   * Format: 1001, 1002, 1003, ...
   * 
   * Uses MySQL row-level locking via DocumentSequenceService to guarantee atomic uniqueness.
   * Eliminates unsafe fallbacks (no count + 1001 fallbacks).
   */
  public static async getNextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    return DocumentSequenceService.getNextOrderNumber(tx);
  }
}
