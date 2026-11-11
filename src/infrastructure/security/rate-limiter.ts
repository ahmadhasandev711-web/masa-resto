/**
 * Thread-safe In-Memory Sliding Window Rate Limiter
 * Provides high-performance throttling for brute force and scraping prevention (GR-1.2, GR-4).
 *
 * TODO(Redis): Migrate store to Redis / Upstash when horizontally scaling to multiple Node.js instances.
 * In single-instance deployment, this in-memory Map provides microsecond lookups with automatic sliding expiration.
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class RateLimiter {
  private static store = new Map<string, RateLimitRecord>();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Checks if an action is permitted within the given rate limit window.
   *
   * @param key Unique identifier (e.g. `tracker:192.168.1.1`)
   * @param limit Maximum number of allowed requests in window
   * @param windowMs Window duration in milliseconds
   * @returns allowed boolean and remaining attempts
   */
  public static check(
    key: string,
    limit: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    this.ensureCleanupScheduled();

    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.store.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(key, record);
    }

    // Filter out timestamps outside current sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= limit) {
      const oldestInWindow = record.timestamps[0] || now;
      const resetAt = oldestInWindow + windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: limit - record.timestamps.length,
      resetAt: now + windowMs,
    };
  }

  /**
   * Resets rate limit for a specific key (useful for tests or successful auth resets).
   */
  public static reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clears the entire store (for unit tests).
   */
  public static clear(): void {
    this.store.clear();
  }

  private static ensureCleanupScheduled(): void {
    if (this.cleanupInterval) return;

    // Periodically clean up stale keys every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of RateLimiter.store.entries()) {
        const hasRecent = record.timestamps.some((ts) => now - ts < 15 * 60 * 1000);
        if (!hasRecent) {
          RateLimiter.store.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    // Prevent blocking process exit in tests/node
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }
}
