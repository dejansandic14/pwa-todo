import { strings } from './strings'

// Banja Luka. One fixed URL: the service worker keys its weather cache by this exact string.
export const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=44.7722&longitude=17.1910' +
  '&current=temperature_2m,weather_code,wind_speed_10m' +
  '&daily=temperature_2m_max,temperature_2m_min' +
  '&timezone=Europe%2FSarajevo' +
  '&forecast_days=1'

/** Header the service worker adds to cached copies of the Open-Meteo response. */
export const CACHED_AT_HEADER = 'X-Cached-At'

/** Cache Storage bucket used by the service worker for the weather response. */
export const WEATHER_CACHE = 'pwa-todo-weather-v1'

/** Background Sync tag registered when a refresh is requested while offline. */
export const WEATHER_SYNC_TAG = 'weather-refresh'

/**
 * localStorage key for the fallback used by browsers without Background Sync: an offline
 * refresh request is persisted here so it survives the app being closed and reopened.
 */
export const WEATHER_REFRESH_PENDING_KEY = 'pwa-todo-weather-refresh-pending'

export function hasPendingWeatherRefresh(): boolean {
  try {
    return localStorage.getItem(WEATHER_REFRESH_PENDING_KEY) !== null
  } catch {
    return false
  }
}

/** localStorage can throw (private mode, storage disabled); the flag is then best-effort. */
export function setPendingWeatherRefresh(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(WEATHER_REFRESH_PENDING_KEY, new Date().toISOString())
    else localStorage.removeItem(WEATHER_REFRESH_PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/** Message the service worker posts to windows after it stored a fresh weather copy. */
export const WEATHER_UPDATED = 'WEATHER_UPDATED'

interface OpenMeteoResponse {
  current: { time: string; temperature_2m: number; weather_code: number; wind_speed_10m: number }
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[] }
}

export interface Weather {
  temperature: number
  code: number
  description: string
  wind: number
  min: number
  max: number
  /** When the data was fetched from the network (ISO string). */
  fetchedAt: string
  /** True when the response came from the service worker's Cache Storage. */
  fromCache: boolean
}

/** Requests the weather; when the service worker is active this goes through its SWR route. */
export async function fetchWeather(): Promise<Weather> {
  const response = await fetch(WEATHER_URL)
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`)
  return parseWeather(response)
}

/** Reads the copy the service worker stored, without touching the network. */
export async function readCachedWeather(): Promise<Weather | null> {
  if (!('caches' in window)) return null
  const cache = await caches.open(WEATHER_CACHE)
  const response = await cache.match(WEATHER_URL)
  return response ? parseWeather(response) : null
}

async function parseWeather(response: Response): Promise<Weather> {
  const cachedAt = response.headers.get(CACHED_AT_HEADER)
  const data = (await response.json()) as OpenMeteoResponse
  return {
    temperature: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    description: describeWeatherCode(data.current.weather_code),
    wind: Math.round(data.current.wind_speed_10m),
    min: Math.round(data.daily.temperature_2m_min[0]),
    max: Math.round(data.daily.temperature_2m_max[0]),
    fetchedAt: cachedAt ?? new Date().toISOString(),
    fromCache: cachedAt !== null,
  }
}

/** WMO weather interpretation codes → short Serbian description. */
export function describeWeatherCode(code: number): string {
  const c = strings.weather.codes
  if (code === 0) return c.clear
  if (code === 1) return c.mainlyClear
  if (code === 2) return c.partlyCloudy
  if (code === 3) return c.overcast
  if (code === 45 || code === 48) return c.fog
  if (code >= 51 && code <= 55) return c.drizzle
  if (code === 56 || code === 57) return c.freezingDrizzle
  if (code >= 61 && code <= 65) return c.rain
  if (code === 66 || code === 67) return c.freezingRain
  if (code >= 71 && code <= 75) return c.snow
  if (code === 77) return c.snowGrains
  if (code >= 80 && code <= 82) return c.showers
  if (code === 85 || code === 86) return c.snowShowers
  if (code === 95) return c.thunderstorm
  if (code === 96 || code === 99) return c.thunderstormHail
  return c.unknown
}

/** Date and time of the forecast, so stale cached data is recognizable as such. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sr-Latn-BA', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
