/**
 * Rate Limiter Keys & Categories (GR-1.2)
 * Centralizes all rate limiting prefixes and policies.
 */
export const RateLimiterKeys = {
  ORDER_TRACKER: (ip: string) => `tracker:${ip}`,
  CHECKOUT: (ip: string) => `checkout:${ip}`,
  LOGIN: (identifier: string) => `login:${identifier}`,
  LOGIN_IP: (ip: string) => `login_ip:${ip}`,
} as const;

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export const RateLimitPolicies = {
  ORDER_TRACKER: {
    limit: 15, // 15 requests per minute
    windowMs: 60 * 1000,
  },
  CHECKOUT: {
    limit: 10, // 10 checkouts per 5 minutes per IP
    windowMs: 5 * 60 * 1000,
  },
  LOGIN: {
    limit: 5, // 5 login attempts per 15 minutes
    windowMs: 15 * 60 * 1000,
  },
  LOGIN_IP: {
    limit: 20, // 20 login attempts per 15 minutes
    windowMs: 15 * 60 * 1000,
  },
} as const;
