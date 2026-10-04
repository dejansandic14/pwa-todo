# PWA Todo

A small progressive web app for a to-do list stored in the browser, plus a weather card for Banja Luka. It can be installed and it works offline. The interface is in Serbian (Latin).

Live site (GitHub Pages, the only deployment): https://dejansandic14.github.io/pwa-todo/

## Reproducing the build

Requires Node.js 20 or newer.

```bash
npm ci
npm run build       # type-checks src/, then writes the production build to dist/
npm run typecheck   # tsc over src/, the Vite/Vitest configs, and tests/
npm test            # Vitest: offline storage, notifications, Background Sync, installability
npm run dev         # dev server at http://localhost:5173/pwa-todo/
```

Deployment is automatic: every push to `main` runs `.github/workflows/pages.yml`, which type-checks, builds, tests, and publishes `dist/` to GitHub Pages.

## Measured production build

Measured from `dist/` after a clean `npm ci && npm run build` with Node v22.14.0 and npm 10.9.7:

| File | Bytes |
| --- | ---: |
| `assets/index-DJ5EI2YB.js` (main JS) | 157711 |
| `assets/index-akNYs1-b.css` | 4248 |
| `assets/workbox-window.prod.es5-BBnX5xw4.js` | 5748 |
| `index.html` | 791 |
| `manifest.webmanifest` | 541 |
| `sw.js` (service worker) | 2874 |
| `icons/icon-192.png` | 2305 |
| `icons/icon-512.png` | 7607 |
| `icons/icon-512-maskable.png` | 4937 |
| **Total** | **186762** |

9 files in `dist/`. The service worker precaches 8 entries — everything above except `sw.js` itself — and the build reports the precache as 164.55 KiB (that figure counts the JS, CSS and HTML entries; the manifest and icon entries are precached as well).

## Tests

`npm test` runs the Vitest suite (28 tests):

- `src/db.test.ts` — creating, editing and deleting tasks in IndexedDB with no network, including that they survive the app being fully closed and reopened (fresh connection against the same store).
- `src/components/TodoList.test.tsx` — the UI creates, edits, completes and deletes tasks while `fetch` always fails and `navigator.onLine` is false, and completing a task triggers the notification path.
- `src/components/NotificationsToggle.test.tsx` — the permission flow and the system notification shown through `ServiceWorkerRegistration.showNotification`.
- `src/components/WeatherCard.test.tsx` — the forecast renders from the network, an offline refresh registers Background Sync (`weather-refresh`), the fallback refreshes the forecast as soon as the `online` event fires, and the card re-reads the cache when the service worker announces fresh data.
- `src/sw.test.ts` — the service worker itself: precaching on install, serving navigations from the app shell without the network, cleaning old caches on activate, refreshing the forecast on the Background Sync event (and rejecting on failure so the browser retries), and notification clicks focusing or opening the app.
- `tests/dist.test.ts` — PWA installability of the real production build: manifest fields (`standalone`, `start_url`, `scope`, `id`), icon files with the declared pixel sizes including the maskable one, the manifest link in `index.html`, the injected precache list in `sw.js`, and service worker registration from the main bundle. Builds `dist/` first if it is missing.
