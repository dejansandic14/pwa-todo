/// <reference lib="webworker" />

// Hand-written service worker. vite-plugin-pwa (injectManifest mode) only replaces
// `self.__WB_MANIFEST` with the list of built files; no Workbox runtime is used.

import { CACHED_AT_HEADER, WEATHER_CACHE, WEATHER_SYNC_TAG, WEATHER_UPDATED, WEATHER_URL } from './weather'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Background Sync is not in TypeScript's lib.webworker yet.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string
  readonly lastChance: boolean
}

// The shell cache name is derived from the precache manifest, so every build with different
// assets gets a fresh cache. The activate handler then deletes the previous build's cache,
// which is what removes old hashed assets. The weather cache keeps its fixed name and the
// to-do tasks live in IndexedDB, so neither is touched by shell updates.
function manifestVersion(entries: Array<{ url: string; revision: string | null }>): string {
  const text = entries
    .map((entry) => `${entry.url}@${entry.revision ?? ''}`)
    .sort()
    .join('|')
  // FNV-1a, 32-bit: tiny, synchronous, stable across SW restarts for the same build.
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

// Read exactly once: workbox's injectManifest requires a single `self.__WB_MANIFEST` match.
const PRECACHE_MANIFEST = self.__WB_MANIFEST

const SHELL_CACHE = `pwa-todo-shell-${manifestVersion(PRECACHE_MANIFEST)}`
const CURRENT_CACHES = [SHELL_CACHE, WEATHER_CACHE]
const WEATHER_HOST = new URL(WEATHER_URL).hostname

// Scope is the site prefix; the app shell is index.html under it.
const SCOPE_PATH = new URL(self.registration.scope).pathname
const SHELL_URL = SCOPE_PATH + 'index.html'

// --- install: precache the app shell -----------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Entry URLs are relative to sw.js, i.e. to the scope. Deduplicate (addAll rejects duplicates)
      // and use `cache: 'reload'` so a new SW version never precaches stale files from the HTTP cache.
      const urls = [...new Set(PRECACHE_MANIFEST.map((entry) => entry.url))]
      await cache.addAll(urls.map((url) => new Request(url, { cache: 'reload' })))
      await self.skipWaiting()
    })(),
  )
})

// --- activate: drop caches from older versions --------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('pwa-todo-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

// --- fetch: app shell for navigations, cache-first for own assets, SWR for weather --------

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(appShell(request))
    return
  }

  if (url.hostname === WEATHER_HOST) {
    event.respondWith(staleWhileRevalidate(event))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request))
  }
})

async function appShell(request: Request): Promise<Response> {
  const cached = await caches.match(SHELL_URL)
  if (cached) return cached
  return fetch(request)
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request)
  if (cached) return cached
  return fetch(request)
}

// --- weather: stale-while-revalidate ------------------------------------------------------

/**
 * Answer immediately from the weather cache when possible and refresh it from the network
 * in the background; when the fresh copy lands, tell open pages so they can re-read it.
 * Without a cached copy the network response is awaited (and cached for next time).
 * The background refresh is handed to `event.waitUntil`, otherwise the browser may stop
 * the worker right after `respondWith` settles and the cache write would never happen.
 */
async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
  const { request } = event
  const cache = await caches.open(WEATHER_CACHE)
  const cached = await cache.match(request)

  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, await stampCachedAt(response.clone()))
      if (cached) await broadcast({ type: WEATHER_UPDATED })
    }
    return response
  })

  if (cached) {
    event.waitUntil(
      network.catch(() => {
        /* offline or API down: the stale copy already answered the page */
      }),
    )
    return cached
  }
  return network
}

/** Copy of the response with an extra header recording when it was fetched. */
async function stampCachedAt(response: Response): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.set(CACHED_AT_HEADER, new Date().toISOString())
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers })
}

async function broadcast(message: { type: string }): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) client.postMessage(message)
}

// --- Background Sync: refresh the weather once connectivity returns -----------------------

self.addEventListener('sync', (event) => {
  const sync = event as SyncEvent
  if (sync.tag !== WEATHER_SYNC_TAG) return
  console.info('[sw] sync event for tag', sync.tag)
  // If the promise rejects (still offline / API down) the browser retries the sync later.
  sync.waitUntil(refreshWeather())
})

async function refreshWeather(): Promise<void> {
  const response = await fetch(WEATHER_URL)
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`)
  const cache = await caches.open(WEATHER_CACHE)
  await cache.put(WEATHER_URL, await stampCachedAt(response))
  await broadcast({ type: WEATHER_UPDATED })
}

// --- notifications: clicking one focuses (or opens) the app --------------------------------

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => client.url.startsWith(self.registration.scope))
      if (existing) {
        await existing.focus()
      } else {
        await self.clients.openWindow(self.registration.scope)
      }
    })(),
  )
})
