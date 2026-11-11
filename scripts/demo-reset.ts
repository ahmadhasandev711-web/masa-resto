/**
 * Public showcase reset.
 *
 * Refuses to run unless DEMO_MODE is exactly "true", then truncates every
 * application table (migrations are kept) and loads prisma/seed-demo.ts.
 *
 * Server cron, every 6 hours, from the app directory:
 *   0 0,6,12,18 * * * cd /var/www/resto && DEMO_MODE=true /usr/bin/npm run db:demo-reset >> /var/log/resto-demo-reset.log 2>&1
 *
 * The .env on that server must also contain DEMO_MODE=true so the running app
 * shows the banner and enforces the demo guard. Do not set this on a real restaurant.
 */
import 'dotenv/config';
import mariadb from 'mariadb';
import { prisma } from '../src/infrastructure/db/prisma';
import { env } from '../src/infrastructure/config/env';
import { assertDemoResetAllowed, assertSafeSqlIdentifier } from '../src/infrastructure/demo/demo-policy';
import { seedDemo } from '../prisma/seed-demo';

function databaseConfig() {
  const url = new URL(env.DATABASE_URL);
  return {
    host: url.hostname === 'localhost' ? '127.0.0.1' : url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || ''),
    database: url.pathname.replace(/^\//, ''),
  };
}

/**
 * Truncate on one session. FOREIGN_KEY_CHECKS is session-scoped, and the Prisma
 * pool would apply the flag on a different connection than the TRUNCATE.
 */
async function truncateApplicationTables(): Promise<void> {
  const connection = await mariadb.createConnection(databaseConfig());
  try {
    const rows = await connection.query<Array<Record<string, string>>>('SHOW TABLES');
    const tables = rows
      .map((row) => Object.values(row)[0])
      .filter((name): name is string => typeof name === 'string' && name.length > 0 && name !== '_prisma_migrations')
      .map((name) => assertSafeSqlIdentifier(name));
    console.log(`[demo-reset] truncating ${tables.length} tables`);
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await connection.end();
  }
}

async function main() {
  assertDemoResetAllowed();
  const started = Date.now();
  await truncateApplicationTables();
  await seedDemo();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[demo-reset] finished in ${elapsed}s`);
}

main()
  .catch((error) => {
    console.error('[demo-reset] failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });