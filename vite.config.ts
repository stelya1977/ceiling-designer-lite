import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Build an offline app shell from the actual hashed Vite output, without extra dependencies.
function offlineShell(): Plugin {
  let outDir: string
  return {
    name: 'ceiling-offline-shell',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    writeBundle: { order: 'post', handler() {
      function walk(dir: string, prefix = ''): string[] {
        return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
          const relative = prefix + entry.name
          return entry.isDirectory() ? walk(resolve(dir, entry.name), relative + '/') : [relative]
        })
      }
      const files = walk(outDir).filter(file => file !== 'sw.js' && !file.endsWith('.map')).sort()
      if (!files.includes('index.html')) throw new Error('Offline shell: index.html not found')
      const hash = createHash('sha256')
      for (const file of files) hash.update(file).update(readFileSync(resolve(outDir, file)))
      const version = hash.digest('hex').slice(0, 20)
      const worker = `
const CACHE_PREFIX = 'ceiling-designer-shell-';
const CACHE = CACHE_PREFIX + '${version}';
const FILES = ${JSON.stringify(files.map(f => '/' + f))};
const FILE_SET = new Set(FILES);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(path => new Request(path, { cache: 'reload' })));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Never cache Supabase or external services.
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Keep HTML and hashed assets on the same release until all old tabs are closed.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match('/index.html')) || fetch(request);
    })());
  } else if (FILE_SET.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
});
`;
      writeFileSync(resolve(outDir, 'sw.js'), worker)
    } },
  }
}
export default defineConfig({ plugins: [react(), offlineShell()] })
