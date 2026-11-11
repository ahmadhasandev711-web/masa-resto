import { ValidationError } from '../../domain/shared/errors/domain-error';
import { RateLimiter } from './rate-limiter';
import { RateLimiterKeys, RateLimitPolicies } from './rate-limiter-keys';

const THROTTLED_MESSAGE = 'محاولات دخول كثيرة. يرجى الانتظار 15 دقيقة ثم المحاولة مرة أخرى.';

export class LoginThrottle {
  private static accountKey(ip: string, username: string): string {
    return RateLimiterKeys.LOGIN(`${ip}:${username.trim().toLowerCase()}`);
  }

  public static assertAllowed(ip: string, username: string): void {
    const account = RateLimitPolicies.LOGIN;
    const network = RateLimitPolicies.LOGIN_IP;

    const accountCheck = RateLimiter.check(this.accountKey(ip, username), account.limit, account.windowMs);
    const networkCheck = RateLimiter.check(RateLimiterKeys.LOGIN_IP(ip), network.limit, network.windowMs);

    if (!accountCheck.allowed || !networkCheck.allowed) {
      throw new ValidationError(THROTTLED_MESSAGE);
    }
  }

  public static clearAccount(ip: string, username: string): void {
    RateLimiter.reset(this.accountKey(ip, username));
  }
}