import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../src/infrastructure/config/env';

describe('C1: Environment Security & JWT_SECRET Validation', () => {
  it('rejects JWT_SECRET shorter than 32 characters in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
        JWT_SECRET: 'short_secret',
      })
    ).toThrow();
  });

  it('rejects placeholder/forbidden words in JWT_SECRET in production', () => {
    const forbiddenSecrets = [
      'replace_with_a_super_secure_random_jwt_secret_min_32_chars!',
      'secret_key_1234567890_abcdefghijklmnop',
      'my_super_long_production_key_1234567890123',
      'please_change_this_jwt_secret_in_production_now!',
      'example_key_that_is_long_enough_12345678901',
      'password_based_jwt_secret_must_not_be_used_ever!',
    ];

    for (const secret of forbiddenSecrets) {
      expect(() =>
        parseEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
          JWT_SECRET: secret,
        })
      ).toThrow(/forbidden|JWT_SECRET/i);
    }
  });

  it('accepts a strong, random 32+ character JWT_SECRET in production', () => {
    const strongSecret = 'k9#mP$2vL@8zQ!wX5rT&1yU*4cB^7nD%0eF~6gH';
    const parsed = parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      JWT_SECRET: strongSecret,
    });

    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.JWT_SECRET).toBe(strongSecret);
  });
});
