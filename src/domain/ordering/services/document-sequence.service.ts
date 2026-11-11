import { Prisma } from '@prisma/client';

export class DocumentSequenceService {
  /**
   * Generates a date string in YYYYMMDD format according to Africa/Cairo local time.
   */
  public static getCairoDateString(date: Date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date).replace(/-/g, '');
  }

  /**
   * Atomically increments and returns the next sequence number for a given document key.
   * Guarantees race-condition-free sequences using MySQL row-level locking with LAST_INSERT_ID.
   */
  public static async getNextSequence(
    tx: Prisma.TransactionClient,
    key: string,
    initialOffset = 0
  ): Promise<number> {
    // 1. Ensure the key row exists with initialOffset if missing
    await tx.$executeRawUnsafe(
      `INSERT INTO document_sequences (\`key\`, \`value\`)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE \`key\` = \`key\``,
      key,
      initialOffset
    );

    // 2. Increment atomically and bind to LAST_INSERT_ID
    await tx.$executeRawUnsafe(
      `UPDATE document_sequences
       SET \`value\` = LAST_INSERT_ID(\`value\` + 1)
       WHERE \`key\` = ?`,
      key
    );

    // 3. Read LAST_INSERT_ID within the same connection/transaction
    const result = await tx.$queryRawUnsafe<Array<{ val: number | bigint | string }>>(
      `SELECT LAST_INSERT_ID() AS val`
    );

    if (!result || result.length === 0 || result[0].val === undefined || result[0].val === null) {
      throw new Error(`Failed to retrieve next sequence for key "${key}"`);
    }

    return Number(result[0].val);
  }

  /**
   * Physical POS & Dine-in sequential order number: 1001, 1002, ...
   */
  public static async getNextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const seq = await this.getNextSequence(tx, 'ORDER', 1000);
    return String(seq);
  }

  /**
   * Daily online web order number: WEB-YYYYMMDD-001, WEB-YYYYMMDD-002, ...
   * Strictly formatted using Africa/Cairo local date.
   */
  public static async getNextWebOrderNumber(
    tx: Prisma.TransactionClient,
    date: Date = new Date()
  ): Promise<string> {
    const datePrefix = this.getCairoDateString(date);
    const key = `WEB-${datePrefix}`;
    const seq = await this.getNextSequence(tx, key, 0);
    return `WEB-${datePrefix}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * Purchase Order number: PO-1001, PO-1002, ...
   */
  public static async getNextPurchaseOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const seq = await this.getNextSequence(tx, 'PO', 1000);
    return `PO-${seq}`;
  }

  /**
   * Driver Settlement number: STL-YYYYMMDD-0001, ...
   */
  public static async getNextSettlementNumber(
    tx: Prisma.TransactionClient,
    date: Date = new Date()
  ): Promise<string> {
    const datePrefix = this.getCairoDateString(date);
    const key = `STL-${datePrefix}`;
    const seq = await this.getNextSequence(tx, key, 0);
    return `STL-${datePrefix}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Return Invoice number: RET-1001, RET-1002, ...
   */
  public static async getNextReturnNumber(tx: Prisma.TransactionClient): Promise<string> {
    const seq = await this.getNextSequence(tx, 'RET', 1000);
    return `RET-${seq}`;
  }
}
