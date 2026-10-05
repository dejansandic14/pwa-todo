# PWA Todo

A small progressive web app for a to-do list stored in the browser, plus a weather card for Banja Luka. It can be installed and it works offline. The interface is in Serbian (Latin).

Live site (GitHub Pages, the only deployment): https://dejansandic14.github.io/pwa-todo/

## Reproducing the build

Requires Node.js 22.12 or newer (vitest's engine requirement).

```bash
npm ci
npm run build       # type-checks src/, then writes the production build to dist/
npm run typecheck   # tsc over src/, the Vite/Vitest configs, and tests/
npm test            # Vitest: offline storage, notifications, Background Sync, installability
npm run dev         # dev server at http://localhost:5173/pwa-todo/
```

Deployment is automatic: every push to `main` runs `.github/workflows/pages.yml` (Node 22), which type-checks, builds, tests, and publishes `dist/` to GitHub Pages.

## Measured production build

Measured from `dist/` after a clean `npm ci && npm run build` with Node v22.14.0 and npm 10.9.7:

| File | Bytes |
| --- | ---: |
| `assets/index-DHarR6Dp.js` (main JS) | 159721 |
| `assets/index-aXFMNjy7.css` | 4296 |
| `assets/workbox-window.prod.es5-BBnX5xw4.js` | 5748 |
| `index.html` | 791 |
| `manifest.webmanifest` | 541 |
| `sw.js` (service worker) | 3107 |
| `icons/icon-192.png` | 2305 |
| `icons/icon-512.png` | 7607 |
| `icons/icon-512-maskable.png` | 4937 |
| **Total** | **189053** |

9 files in `dist/`. The service worker precaches 8 entries — everything above except `sw.js` itself — and the build reports the precache as 166.56 KiB (that figure counts the JS, CSS and HTML entries; the manifest and icon entries are precached as well). The shell cache name is derived from the precache manifest, so every deploy installs into a fresh cache and activation deletes the previous build's assets without touching the weather cache or the IndexedDB tasks.

## Tests

`npm test` runs the Vitest suite (54 tests):

- `src/db.test.ts` — creating, editing and deleting tasks in IndexedDB with no network, including that they survive the app being fully closed and reopened (fresh connection against the same store); writes settle only when the transaction commits — they stay pending until `complete` and reject on `abort`/`error` or a severed connection.
- `src/components/TodoList.test.tsx` — the UI creates, edits, completes and deletes tasks while `fetch` always fails and `navigator.onLine` is false; completing a task triggers the notification path; a failed load shows an error state instead of the empty list; a failed write or delete shows a visible message without diverging from IndexedDB; and the 200-character title limit is enforced when adding and when editing, in the inputs and again in the save logic.
- `src/components/NotificationsToggle.test.tsx` — the permission flow and the system notification shown through `ServiceWorkerRegistration.showNotification`.
- `src/components/WeatherCard.test.tsx` — the forecast renders from the network, the timestamp shows the date and not only the time, an offline refresh registers Background Sync (`weather-refresh`), the fallback without Background Sync persists the queued refresh so it survives closing and reopening the app and runs it when the network returns (or on the next open), a refresh that fails while the device claims to be online shows a clear message while keeping the saved forecast, and the card re-reads the cache when the service worker announces fresh data.
- `src/weather.test.ts` — the date-and-time formatting of the forecast timestamp and the localStorage-backed pending-refresh flag, including graceful degradation when localStorage is unavailable.
- `src/storage.test.ts` — the persistent-storage request: skipped without the Storage API, not repeated once granted, silent when the permission is already granted, and asked at most once when the browser might prompt.
- `src/sw.test.ts` — the service worker itself: precaching on install, serving navigations from the app shell without the network, cleaning old caches on activate, giving each build its own shell cache (removed on the next build's activation while the saved forecast survives), keeping the worker alive with `waitUntil` until the stale-while-revalidate background refresh lands, refreshing the forecast on the Background Sync event (and rejecting on failure so the browser retries), and notification clicks focusing or opening the app.
- `tests/dist.test.ts` — PWA installability of the real production build: manifest fields (`standalone`, `start_url`, `scope`, `id`), icon files with the declared pixel sizes including the maskable one, the manifest link in `index.html`, the injected precache list and the versioned shell cache name in `sw.js`, and service worker registration plus the persistent-storage request in the main bundle. Builds `dist/` first if it is missing.
