import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Build an offline app shell from the actual hashed Vite output, without extra dependencies.
function offlineShell(): Plugin {
  let outDir: string
  let release: string
  return {
    name: 'ceiling-offline-shell',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); release = JSON.parse(readFileSync(resolve(config.root, 'package.json'), 'utf8')).version },
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
const RELEASE = ${JSON.stringify(release)};
const FILES = ${JSON.stringify(files.map(f => '/' + f))};
const FILE_SET = new Set(FILES);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(path => new Request(path, { cache: 'reload' })));
    // Activate only after the complete new shell has been downloaded.
    await self.skipWaiting();
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
self.addEventListener('message', event => {
  if (event.data?.type === 'CEILING_VERSION') event.source?.postMessage({ type: 'CEILING_VERSION', version: RELEASE });
});
self.addEventListener('push', event => {
  // No client names, addresses, or payment amounts on a locked phone.
  let id = '';
  try { id = event.data?.json()?.id || ''; } catch {}
  event.waitUntil(self.registration.showNotification('НСК · Нове сповіщення', {
    body: 'Відкрий кабінет монтажника, щоб переглянути повідомлення.',
    icon: '/icon-192.png', badge: '/icon-192.png', tag: id ? 'nsk-' + id : 'nsk-push',
    data: { path: '/?notifications=1' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin) {
        await tab.focus(); tab.postMessage({ type: 'CEILING_OPEN_NOTIFICATIONS' }); return;
      }
    }
    await self.clients.openWindow('/?notifications=1');
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Never cache Supabase or external services.
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Serve the fully installed release as a coherent offline shell.
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
