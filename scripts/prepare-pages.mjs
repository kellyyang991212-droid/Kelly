import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, relative, resolve } from 'node:path';

const basePath = (process.env.EXPO_BASE_PATH || '/Kelly').replace(/\/$/, '');
const directory = join(process.cwd(), 'dist');
// upload-pages-artifact omits hidden directories, including pnpm's exported font paths.
// Keep the generated assets in a visible directory and update their bundle references.
const hiddenAssets = resolve(directory, 'assets', 'node_modules', '.pnpm');
const visibleAssets = resolve(directory, 'assets', 'node_modules', 'pnpm');
for (const target of [hiddenAssets, visibleAssets]) {
  const child = relative(resolve(directory), target);
  if (child.startsWith('..') || child === '') throw new Error('Asset directory must remain inside dist');
}
if (existsSync(hiddenAssets)) {
  if (existsSync(visibleAssets)) throw new Error('Please export a fresh dist before preparing Pages');
  renameSync(hiddenAssets, visibleAssets);
}
function normalizeReferences(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) normalizeReferences(file);
    else if (['.js', '.html', '.css', '.json', '.map'].includes(extname(file))) {
      const original = readFileSync(file, 'utf8');
      const updated = original.replaceAll('/.pnpm/', '/pnpm/');
      if (updated !== original) writeFileSync(file, updated);
    }
  }
}
normalizeReferences(directory);
let index = readFileSync(join(directory, 'index.html'), 'utf8');
const scripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
if (!scripts.length || scripts.some(src => !src.startsWith(`${basePath}/`))) {
  throw new Error(`Exported script URLs must start with ${basePath}/. Build with EXPO_BASE_PATH=${basePath}.`);
}
const releaseHash = createHash('sha256');
for (const src of scripts) {
  const local = join(directory, src.slice(basePath.length + 1));
  const bytes = readFileSync(local);
  releaseHash.update(bytes);
  // Use the final bytes for the cache key after normalizing exported asset paths.
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const name = `index-${digest}.js`;
  const target = join(local, '..', name);
  if (resolve(local) !== resolve(target)) renameSync(local, target);
  index = index.replace(src, src.replace(/[^/]+$/, name));
}
const version = releaseHash.digest('hex').slice(0, 32);
if (!index.includes('</head>')) throw new Error('Exported HTML is missing its head element.');
index = index.replace('</head>', `<meta name="kelly-version" content="${version}"><link rel="kelly-release" href="${basePath}/release.json"></head>`);
writeFileSync(join(directory, 'release.json'), JSON.stringify({ version }));
writeFileSync(join(directory, 'index.html'), index);
writeFileSync(join(directory, '.nojekyll'), '');
copyFileSync(join(directory, 'index.html'), join(directory, '404.html'));
console.log(`GitHub Pages output verified: ${scripts.length} script bundle(s), base ${basePath}/`);
