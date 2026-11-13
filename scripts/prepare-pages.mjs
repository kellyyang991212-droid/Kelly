import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const basePath = (process.env.EXPO_BASE_PATH || '/Kelly').replace(/\/$/, '');
const directory = join(process.cwd(), 'dist');
const index = readFileSync(join(directory, 'index.html'), 'utf8');
const scripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
if (!scripts.length || scripts.some(src => !src.startsWith(`${basePath}/`))) {
  throw new Error(`Exported script URLs must start with ${basePath}/. Build with EXPO_BASE_PATH=${basePath}.`);
}
for (const src of scripts) {
  const local = join(directory, src.slice(basePath.length + 1));
  readFileSync(local); // Fail before publication if a referenced bundle is missing.
}
writeFileSync(join(directory, '.nojekyll'), '');
copyFileSync(join(directory, 'index.html'), join(directory, '404.html'));
console.log(`GitHub Pages output verified: ${scripts.length} script bundle(s), base ${basePath}/`);
