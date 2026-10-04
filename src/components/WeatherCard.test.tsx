import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { CACHED_AT_HEADER, WEATHER_SYNC_TAG, WEATHER_UPDATED, WEATHER_URL } from '../weather'
import WeatherCard from './WeatherCard'

const t = strings.weather

function weatherResponse(temperature: number): Response {
  const body = {
    current: { time: '2026-10-04T12:00', temperature_2m: temperature, weather_code: 3, wind_speed_10m: 12 },
    daily: { temperature_2m_max: [temperature + 2], temperature_2m_min: [temperature - 2] },
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: object | null = {}
  ready: Promise<unknown> = Promise.resolve({})
}

let container: FakeServiceWorkerContainer

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

beforeEach(() => {
  container = new FakeServiceWorkerContainer()
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: container })
  setOnline(true)
})

describe('WeatherCard', () => {
  it('renders the forecast fetched from the network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => weatherResponse(21)))

    render(<WeatherCard />)

    expect(await screen.findByText('21°C')).toBeTruthy()
    expect(screen.getByText(t.codes.overcast)).toBeTruthy()
    expect(screen.getByText('12 km/h')).toBeTruthy()
  })

  it('registers a Background Sync when refreshed while offline', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    vi.stubGlobal('SyncManager', class {})
    const register = vi.fn(async () => {})
    container.ready = Promise.resolve({ sync: { register } })
    setOnline(false)

    render(<WeatherCard />)
    await screen.findByText(t.error)
    await userEvent.setup().click(screen.getByRole('button', { name: t.refresh }))

    expect(await screen.findByText(t.syncScheduled)).toBeTruthy()
    expect(register).toHaveBeenCalledWith(WEATHER_SYNC_TAG)
  })

  it('without Background Sync, refreshes the forecast as soon as the network returns', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(() => Promise.reject(new TypeError('Failed to fetch')))
    vi.stubGlobal('fetch', fetchMock)
    setOnline(false)

    render(<WeatherCard />)
    await screen.findByText(t.error)
    await userEvent.setup().click(screen.getByRole('button', { name: t.refresh }))
    await screen.findByText(t.syncFallback)

    // The connection comes back and the queued refresh runs by itself.
    fetchMock.mockImplementation(async () => weatherResponse(25))
    setOnline(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(await screen.findByText('25°C')).toBeTruthy()
  })

  it('re-reads the cache when the service worker announces fresh data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => weatherResponse(18)))
    render(<WeatherCard />)
    await screen.findByText('18°C')

    // The service worker stored a fresh copy (SWR revalidation or Background Sync)...
    const fresh = new Response(await weatherResponse(23).blob(), {
      status: 200,
      headers: { [CACHED_AT_HEADER]: new Date().toISOString() },
    })
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ match: vi.fn(async (url: string) => (url === WEATHER_URL ? fresh : undefined)) })),
    })

    // ...and tells the page about it.
    act(() => {
      container.dispatchEvent(new MessageEvent('message', { data: { type: WEATHER_UPDATED } }))
    })

    expect(await screen.findByText('23°C')).toBeTruthy()
  })
})
