import { execSync } from 'child_process';
import net from 'net';

async function checkPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 1000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const testDbUrl = process.env.TEST_DATABASE_URL || 'mysql://root:password@127.0.0.1:3306/resto_test';
  process.env.DATABASE_URL = testDbUrl;

  const url = new URL(testDbUrl);
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  const port = url.port ? parseInt(url.port, 10) : 3306;

  console.log(`[test:db] Checking MySQL connection at ${host}:${port}...`);
  const isUp = await checkPort(host, port);

  if (!isUp) {
    console.warn(`[test:db] MySQL is not reachable at ${host}:${port}.`);
    console.warn(`[test:db] If using Docker, please run: docker compose -f docker-compose.test.yml up -d`);
    console.warn(`[test:db] Running vitest (integration tests requiring live MySQL will be skipped cleanly)...`);
  } else {
    console.log(`[test:db] Applying migrations to test database...`);
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
      console.log(`[test:db] Seeding test database...`);
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env: process.env });
    } catch (err) {
      console.error(`[test:db] Migration/seed failed:`, err);
    }
  }

  console.log(`[test:db] Running test suite...`);
  try {
    execSync('npx vitest run --fileParallelism=false', { stdio: 'inherit', env: process.env });
  } catch {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
