import fs from 'fs';
import path from 'path';
import { renderServiceWorker } from '../src/infrastructure/demo/service-worker-source';

const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
const version = pkg.version ?? '';
const source = renderServiceWorker(version);
const target = path.join(process.cwd(), 'public', 'sw.js');
fs.writeFileSync(target, source);
console.log(`[sw] wrote ${target} cache=${source.match(/CACHE_NAME = '([^']+)'/)?.[1]}`);