import bcrypt from 'bcryptjs';

export class PasswordService {
  private static readonly SALT_ROUNDS = 12;
  private static readonly DUMMY_HASH = '$2a$12$e8N4a0y8O/50tqM.O5Xj7e7WbA5a0g5gY1.xKjQZJ9J9n6V1B8ehe';

  public static async burnComparisonTime(password: string): Promise<void> {
    await bcrypt.compare(password, this.DUMMY_HASH).catch(() => {});
  }

  public static async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  public static async compare(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
}
