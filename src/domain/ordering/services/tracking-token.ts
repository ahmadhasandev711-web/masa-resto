import { randomBytes } from 'crypto';

/** Public tracking secret: 16 random bytes, base64url. The order number stays human-readable. */
export function createTrackingToken(): string {
  return randomBytes(16).toString('base64url');
}