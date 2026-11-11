import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import net from 'net';

dotenv.config();

async function checkDbConnection(): Promise<boolean> {
  const urlStr = process.env.DATABASE_URL || 'mysql://root:password@127.0.0.1:3306/resto_db';
  try {
    const url = new URL(urlStr);
    const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
    const port = url.port ? parseInt(url.port, 10) : 3306;

    return await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port, timeout: 500 });
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
  } catch {
    return false;
  }
}

export default defineConfig(async () => {
  const isDbUp = await checkDbConnection();

  return {
    test: {
      fileParallelism: false,
      env: {
        TEST_DB_AVAILABLE: isDbUp ? 'true' : 'false',
      },
    },
  };
});
