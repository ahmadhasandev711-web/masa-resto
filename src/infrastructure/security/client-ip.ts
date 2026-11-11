import { headers } from 'next/headers';
import { env } from '../config/env';
import { AppLogger } from '../logging/logger';

const UNKNOWN_CLIENT = 'unknown';
let hasWarnedMissingIp = false;

/**
 * Resolves the client IP counting from the right of X-Forwarded-For.
 * Each trusted proxy appends the address it saw, so entries injected by the
 * client always sit to the left of the ones we trust.
 *
 * If trustedProxyHops <= 0 (exposed directly without trusted proxies),
 * forwardedFor cannot be trusted (can be spoofed by client).
 * In that case, we fall back to realIp / socket remote IP.
 */
export function pickClientIp(
  forwardedFor: string | null,
  realIp: string | null,
  trustedProxyHops: number,
  socketRemoteIp?: string | null
): string {
  if (trustedProxyHops <= 0) {
    const directIp = socketRemoteIp?.trim() || realIp?.trim();
    if (directIp) return directIp;
    if (!hasWarnedMissingIp) {
      hasWarnedMissingIp = true;
      AppLogger.warn(
        'TRUSTED_PROXY_HOPS is set to 0 but no direct/real IP header was found. Consider setting TRUSTED_PROXY_HOPS=1 if behind a reverse proxy.'
      );
    }
    return UNKNOWN_CLIENT;
  }

  const chain = (forwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (chain.length === 0) return realIp?.trim() || socketRemoteIp?.trim() || UNKNOWN_CLIENT;
  return chain[Math.max(chain.length - trustedProxyHops, 0)];
}

export async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return pickClientIp(
      headerList.get('x-forwarded-for'),
      headerList.get('x-real-ip'),
      env.TRUSTED_PROXY_HOPS
    );
  } catch {
    return UNKNOWN_CLIENT;
  }
}
