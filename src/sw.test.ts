// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHED_AT_HEADER, WEATHER_SYNC_TAG, WEATHER_UPDATED, WEATHER_URL } from './weather'

// The service worker runs against a mocked ServiceWorkerGlobalScope + Cache Storage,
// so its install/activate/fetch/sync/notificationclick handlers can be exercised directly.

const SCOPE = 'https://example.test/pwa-todo/'

class FakeRequest {
  url: string
  method = 'GET'
  mode: string
  cache?: string
  constructor(url: string, init?: { cache?: string; mode?: string }) {
    this.url = url
    this.mode = init?.mode ?? 'cors'
    this.cache = init?.cache
  }
}

interface FakeClient {
  url: string
  focus: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
}

type CacheStores = Map<string, Map<string, Response>>

function createEnvironment(manifest: Array<{ url: string; revision: string | null }>, existingStores?: CacheStores) {
  // Cache Storage: Map of cache name → Map of absolute URL → Response.
  // Passing `existingStores` simulates a new SW version starting on the same device.
  const stores: CacheStores = existingStores ?? new Map()
  const cacheKey = (req: unknown) => new URL(typeof req === 'string' ? req : (req as FakeRequest).url, SCOPE).href
  const openStore = (name: string) => {
    let store = stores.get(name)
    if (!store) stores.set(name, (store = new Map()))
    return store
  }
  const addAllCalls: unknown[][] = []
  const caches = {
    open: vi.fn(async (name: string) => {
      const store = openStore(name)
      return {
        addAll: async (reqs: unknown[]) => {
          addAllCalls.push(reqs)
          for (const r of reqs) store.set(cacheKey(r), new Response('precached'))
        },
        put: async (req: unknown, res: Response) => {
          store.set(cacheKey(req), res)
        },
        match: async (req: unknown) => store.get(cacheKey(req)),
      }
    }),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (req: unknown) => {
      for (const store of stores.values()) {
        const hit = store.get(cacheKey(req))
        if (hit) return hit
      }
      return undefined
    }),
  }

  const listeners = new Map<string, (event: unknown) => void>()
  const clients: FakeClient[] = []
  const self = {
    registration: { scope: SCOPE },
    location: { origin: new URL(SCOPE).origin },
    __WB_MANIFEST: manifest,
    skipWaiting: vi.fn(async () => {}),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => clients),
      openWindow: vi.fn(async () => null),
    },
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
  }

  vi.stubGlobal('self', self)
  vi.stubGlobal('caches', caches)
  vi.stubGlobal('Request', FakeRequest)

  const dispatch = (type: string, event: unknown) => listeners.get(type)!(event)
  return { self, stores, openStore, addAllCalls, clients, dispatch }
}

/** ExtendableEvent stand-in that remembers the promise passed to waitUntil. */
function extendable() {
  let settled: Promise<unknown> = Promise.resolve()
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => {
      settled = p
    }),
    done: () => settled,
  }
}

const MANIFEST = [
  { url: 'index.html', revision: '1' },
  { url: 'assets/index-abc.js', revision: null },
  { url: 'index.html', revision: '1' }, // duplicate on purpose: addAll rejects duplicates
]

async function loadServiceWorker(manifest = MANIFEST, stores?: CacheStores) {
  vi.resetModules()
  const env = createEnvironment(manifest, stores)
  await import('./sw')
  return env
}

/** Name of the (single) shell cache currently present; versioned, so looked up by prefix. */
function shellCacheName(stores: CacheStores): string {
  const names = [...stores.keys()].filter((name) => name.startsWith('pwa-todo-shell-'))
  expect(names).toHaveLength(1)
  return names[0]
}

async function install(env: ReturnType<typeof createEnvironment>) {
  const event = extendable()
  env.dispatch('install', event)
  await event.done()
}

async function activate(env: ReturnType<typeof createEnvironment>) {
  const event = extendable()
  env.dispatch('activate', event)
  await event.done()
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('service worker', () => {
  it('precaches the deduplicated build manifest on install', async () => {
    const env = await loadServiceWorker()
    await install(env)

    expect(env.addAllCalls).toHaveLength(1)
    expect(env.addAllCalls[0]).toHaveLength(2)
    const shell = env.stores.get(shellCacheName(env.stores))!
    expect([...shell.keys()].sort()).toEqual([`${SCOPE}assets/index-abc.js`, `${SCOPE}index.html`])
    expect(env.self.skipWaiting).toHaveBeenCalled()
  })

  it('answers navigations from the precached app shell without touching the network', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    const env = await loadServiceWorker()
    await install(env)

    let answer: Promise<Response> | undefined
    env.dispatch('fetch', {
      request: new FakeRequest(SCOPE, { mode: 'navigate' }),
      respondWith: (r: Promise<Response>) => {
        answer = r
      },
    })

    expect(await (await answer!).text()).toBe('precached')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('drops caches of older versions on activate and claims the clients', async () => {
    const env = await loadServiceWorker()
    await install(env)
    const current = shellCacheName(env.stores)
    env.openStore('pwa-todo-shell-v1') // the legacy fixed-name cache from 0.1.0
    env.openStore('pwa-todo-weather-v1')
    env.openStore('unrelated-cache')

    await activate(env)

    expect([...env.stores.keys()].sort()).toEqual([current, 'pwa-todo-weather-v1', 'unrelated-cache'].sort())
    expect(env.self.clients.claim).toHaveBeenCalled()
  })

  it('gives a new build its own shell cache and removes the old assets on activate', async () => {
    // Version 1 installs and caches the weather; the to-dos live in IndexedDB, outside Cache Storage.
    const v1 = await loadServiceWorker([
      { url: 'index.html', revision: '1' },
      { url: 'assets/index-old.js', revision: null },
    ])
    await install(v1)
    const oldShell = shellCacheName(v1.stores)
    v1.openStore('pwa-todo-weather-v1').set(WEATHER_URL, new Response('saved forecast'))

    // Version 2 (different assets) starts on the same device: same Cache Storage.
    const v2 = await loadServiceWorker(
      [
        { url: 'index.html', revision: '2' },
        { url: 'assets/index-new.js', revision: null },
      ],
      v1.stores,
    )
    await install(v2)

    // Until activation both caches exist, so the old version keeps working mid-update.
    const newShell = shellCacheName(new Map([...v2.stores].filter(([name]) => name !== oldShell)))
    expect(newShell).not.toBe(oldShell)
    expect(v2.stores.get(oldShell)!.size).toBeGreaterThan(0)
    expect([...v2.stores.get(newShell)!.keys()]).toContain(`${SCOPE}assets/index-new.js`)

    await activate(v2)

    expect(v2.stores.has(oldShell)).toBe(false)
    expect(v2.stores.has(newShell)).toBe(true)
    // The saved forecast survived the update.
    expect(await v2.stores.get('pwa-todo-weather-v1')!.get(WEATHER_URL)!.text()).toBe('saved forecast')
  })

  it('reuses the same shell cache name when the build did not change', async () => {
    const v1 = await loadServiceWorker()
    await install(v1)
    const first = shellCacheName(v1.stores)

    const v2 = await loadServiceWorker(MANIFEST, v1.stores)
    await install(v2)

    expect(shellCacheName(v2.stores)).toBe(first)
  })

  it('serves the cached forecast and keeps the worker alive (waitUntil) until the refresh lands', async () => {
    const env = await loadServiceWorker()
    const page: FakeClient = { url: SCOPE, focus: vi.fn(), postMessage: vi.fn() }
    env.clients.push(page)
    env.openStore('pwa-todo-weather-v1').set(WEATHER_URL, new Response('stale forecast'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"fresh":true}', { status: 200 })))

    const event = extendable()
    let answer: Promise<Response> | undefined
    env.dispatch('fetch', {
      ...event,
      request: new FakeRequest(WEATHER_URL),
      respondWith: (r: Promise<Response>) => {
        answer = r
      },
    })

    // The page is answered from the cache immediately...
    expect(await (await answer!).text()).toBe('stale forecast')
    // ...and the background refresh was handed to waitUntil, so the browser must wait for it.
    expect(event.waitUntil).toHaveBeenCalledTimes(1)
    await event.done()

    const cached = env.stores.get('pwa-todo-weather-v1')!.get(WEATHER_URL)!
    expect(await cached.text()).toBe('{"fresh":true}')
    expect(cached.headers.get(CACHED_AT_HEADER)).toBeTruthy()
    expect(page.postMessage).toHaveBeenCalledWith({ type: WEATHER_UPDATED })
  })

  it('keeps the cached forecast when the background refresh fails, without unhandled errors', async () => {
    const env = await loadServiceWorker()
    const stale = new Response('stale forecast')
    env.openStore('pwa-todo-weather-v1').set(WEATHER_URL, stale)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))

    const event = extendable()
    let answer: Promise<Response> | undefined
    env.dispatch('fetch', {
      ...event,
      request: new FakeRequest(WEATHER_URL),
      respondWith: (r: Promise<Response>) => {
        answer = r
      },
    })

    expect(await answer!).toBe(stale)
    await event.done() // must resolve: the failure is swallowed inside the waitUntil promise

    expect(env.stores.get('pwa-todo-weather-v1')!.get(WEATHER_URL)).toBe(stale)
  })

  it('refreshes the forecast on the Background Sync event and notifies open pages', async () => {
    const env = await loadServiceWorker()
    const page: FakeClient = { url: SCOPE, focus: vi.fn(), postMessage: vi.fn() }
    env.clients.push(page)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })))

    const event = { ...extendable(), tag: WEATHER_SYNC_TAG, lastChance: false }
    env.dispatch('sync', event)
    await event.done()

    expect(fetch).toHaveBeenCalledWith(WEATHER_URL)
    const cached = env.stores.get('pwa-todo-weather-v1')!.get(WEATHER_URL)!
    expect(cached.headers.get(CACHED_AT_HEADER)).toBeTruthy()
    expect(page.postMessage).toHaveBeenCalledWith({ type: WEATHER_UPDATED })
  })

  it('ignores sync events with a different tag', async () => {
    const env = await loadServiceWorker()
    const event = { ...extendable(), tag: 'something-else', lastChance: false }
    env.dispatch('sync', event)
    expect(event.waitUntil).not.toHaveBeenCalled()
  })

  it('lets a failed refresh reject so the browser retries the sync later', async () => {
    const env = await loadServiceWorker()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })))

    const event = { ...extendable(), tag: WEATHER_SYNC_TAG, lastChance: false }
    env.dispatch('sync', event)

    await expect(event.done()).rejects.toThrow('Open-Meteo responded 500')
    expect(env.stores.get('pwa-todo-weather-v1')).toBeUndefined()
  })

  it('focuses an open window when a notification is clicked', async () => {
    const env = await loadServiceWorker()
    const page: FakeClient = { url: `${SCOPE}`, focus: vi.fn(async () => {}), postMessage: vi.fn() }
    env.clients.push(page)

    const close = vi.fn()
    const event = { ...extendable(), notification: { close } }
    env.dispatch('notificationclick', event)
    await event.done()

    expect(close).toHaveBeenCalled()
    expect(page.focus).toHaveBeenCalled()
    expect(env.self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens the app when a notification is clicked and no window exists', async () => {
    const env = await loadServiceWorker()
    const event = { ...extendable(), notification: { close: vi.fn() } }
    env.dispatch('notificationclick', event)
    await event.done()

    expect(env.self.clients.openWindow).toHaveBeenCalledWith(SCOPE)
  })
})
