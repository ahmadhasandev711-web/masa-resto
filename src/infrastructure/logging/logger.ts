import { LogMasker } from './log-masker';

/**
 * Enterprise Application Logger
 * Adheres to GR-4.2 (Zero PII leaks) and Sovereign Error Handling (Rule 12.6/Rule 18)
 */
export class AppLogger {
  public static error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

    console.error(
      JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message,
        error: errorDetails,
        meta: meta ? LogMasker.maskObject(meta) : undefined,
      })
    );
  }

  public static warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        message,
        meta: meta ? LogMasker.maskObject(meta) : undefined,
      })
    );
  }

  public static info(message: string, meta?: Record<string, unknown>): void {
    console.info(
      JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message,
        meta: meta ? LogMasker.maskObject(meta) : undefined,
      })
    );
  }
}