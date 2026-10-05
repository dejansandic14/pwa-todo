import { useCallback, useEffect, useState } from 'react'
import { strings } from '../strings'
import {
  fetchWeather,
  formatDateTime,
  hasPendingWeatherRefresh,
  readCachedWeather,
  setPendingWeatherRefresh,
  WEATHER_SYNC_TAG,
  WEATHER_UPDATED,
  type Weather,
} from '../weather'

const t = strings.weather

// Open-Meteo updates "current" conditions every 15 minutes; older cached data is labelled as such.
const STALE_AFTER_MS = 15 * 60 * 1000

// Background Sync is Chromium-only and not in TypeScript's DOM library.
interface SyncManager {
  register(tag: string): Promise<void>
}
type SyncRegistration = ServiceWorkerRegistration & { sync: SyncManager }

export default function WeatherCard() {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    try {
      const fresh = await fetchWeather()
      setWeather(fresh)
      setFailed(false)
      setNotice(null)
      // A fresh network response satisfies a refresh queued offline in an earlier session.
      // A cache hit does not: the service worker's revalidation (WEATHER_UPDATED) clears it.
      if (!fresh.fromCache) setPendingWeatherRefresh(false)
      return true
    } catch {
      setFailed(true)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // A refresh queued offline in a previous session (fallback for browsers without
    // Background Sync): while still offline, re-show the notice; once the network is
    // back the load below performs the refresh and clears the flag.
    if (hasPendingWeatherRefresh() && !navigator.onLine) setNotice(t.syncFallback)
    void load()
    // On the very first visit the worker does not control the page yet, so that first request
    // bypasses it and is not cached. Re-fetch once the worker takes control (clients.claim()).
    const sw = navigator.serviceWorker
    if (sw && !sw.controller) {
      const onControl = () => void load()
      sw.addEventListener('controllerchange', onControl, { once: true })
      return () => sw.removeEventListener('controllerchange', onControl)
    }
  }, [load])

  // The service worker posts WEATHER_UPDATED after it stored a fresh copy (SWR revalidation or
  // Background Sync). Re-read the cache directly — fetching again would trigger another revalidation.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== WEATHER_UPDATED) return
      void readCachedWeather().then((fresh) => {
        if (fresh) {
          setWeather(fresh)
          setNotice(null)
          // The worker just stored a copy fetched from the network: a genuine refresh.
          setPendingWeatherRefresh(false)
        }
      })
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine && hasPendingWeatherRefresh()) void load()
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [load])

  /** "Osvježi": fetch now, or — while offline — queue a Background Sync for when the network returns. */
  async function refresh() {
    if (navigator.onLine) {
      // The device claims to be online, but the request can still fail (captive portal,
      // flaky uplink, API down): say so instead of silently keeping the saved forecast.
      const ok = await load()
      if (!ok) setNotice(t.refreshFailed)
      return
    }
    const registration = (await navigator.serviceWorker?.ready) as SyncRegistration | undefined
    if (registration && 'SyncManager' in window) {
      try {
        await registration.sync.register(WEATHER_SYNC_TAG)
        setNotice(t.syncScheduled)
        return
      } catch (err) {
        console.warn('Background Sync registration failed, using online-event fallback', err)
      }
    }
    // No Background Sync: persist the request so it survives closing the app.
    setPendingWeatherRefresh(true)
    setNotice(t.syncFallback)
  }

  const isStale =
    weather !== null &&
    weather.fromCache &&
    (!online || Date.now() - new Date(weather.fetchedAt).getTime() > STALE_AFTER_MS)

  return (
    <section className="card weather" aria-labelledby="weather-heading">
      <div className="card-header">
        <h2 id="weather-heading">{t.heading}</h2>
        <button type="button" className="btn btn--small" onClick={() => void refresh()} disabled={loading}>
          {loading ? t.refreshing : t.refresh}
        </button>
      </div>

      {weather ? (
        <>
          <div className="weather-main">
            <span className="weather-temp">{weather.temperature}°C</span>
            <span className="weather-desc">{weather.description}</span>
          </div>

          <dl className="weather-details">
            <div>
              <dt>{t.wind}</dt>
              <dd>{weather.wind} km/h</dd>
            </div>
            <div>
              <dt>{t.today}</dt>
              <dd>
                {t.min} {weather.min}° · {t.max} {weather.max}°
              </dd>
            </div>
          </dl>

          <p className="muted weather-updated">
            {t.updated} {formatDateTime(weather.fetchedAt)}
            {isStale ? ` (${t.fromCache})` : ''}
          </p>
        </>
      ) : (
        <p className="muted weather-updated">{failed ? t.error : t.loading}</p>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}
