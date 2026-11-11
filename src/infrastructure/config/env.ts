import 'dotenv/config';
import { z } from 'zod';

const FORBIDDEN_WORDS = ['replace', 'secret', 'super', 'change', 'example', 'password'];

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  PORT: z.coerce.number().default(3000),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    const lower = data.JWT_SECRET.toLowerCase();
    const found = FORBIDDEN_WORDS.find((word) => lower.includes(word));
    if (found) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: `JWT_SECRET contains forbidden placeholder word "${found}". In production, provide a cryptographically secure random secret.`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(customEnv?: Record<string, string | undefined>): Env {
  const envSource = customEnv || process.env;

  // If running in test mode without DATABASE_URL, supply safe mock test env
  if (!customEnv && process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
    return envSchema.parse({
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://root:password@localhost:3306/resto_test',
      JWT_SECRET: 'test_jwt_secret_with_more_than_32_characters_long!',
    });
  }

  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    if (!customEnv) {
      console.error('[Config Error] Invalid environment variables configuration:');
      for (const issue of result.error.issues) {
        console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    // In test environment when reading default process.env fallback
    if (!customEnv && process.env.NODE_ENV === 'test') {
      return envSchema.parse({
        NODE_ENV: 'test',
        DATABASE_URL: 'mysql://root:password@localhost:3306/resto_test',
        JWT_SECRET: 'test_jwt_secret_with_more_than_32_characters_long!',
      });
    }
    throw new Error(`Environment configuration validation failed: ${issues}`);
  }

  return result.data;
}

export const env: Env = parseEnv();
