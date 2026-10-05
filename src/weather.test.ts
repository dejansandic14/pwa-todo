import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatDateTime,
  hasPendingWeatherRefresh,
  setPendingWeatherRefresh,
  WEATHER_REFRESH_PENDING_KEY,
} from './weather'

describe('formatDateTime', () => {
  it('includes the date (not only the time) of the forecast', () => {
    const formatted = formatDateTime('2026-02-03T04:05:00')
    expect(formatted).toContain('2026')
    expect(formatted).toMatch(/\b3\b/) // day of month
    expect(formatted).toMatch(/\d{1,2}:\d{2}/) // time of day
  })
})

describe('pending weather refresh flag (fallback without Background Sync)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists across sessions via localStorage and can be cleared', () => {
    expect(hasPendingWeatherRefresh()).toBe(false)

    setPendingWeatherRefresh(true)
    expect(hasPendingWeatherRefresh()).toBe(true)
    expect(localStorage.getItem(WEATHER_REFRESH_PENDING_KEY)).not.toBeNull()

    setPendingWeatherRefresh(false)
    expect(hasPendingWeatherRefresh()).toBe(false)
    expect(localStorage.getItem(WEATHER_REFRESH_PENDING_KEY)).toBeNull()
  })

  it('degrades gracefully when localStorage is unavailable', () => {
    const denied = () => {
      throw new Error('storage disabled')
    }
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied, removeItem: denied })

    expect(() => setPendingWeatherRefresh(true)).not.toThrow()
    expect(hasPendingWeatherRefresh()).toBe(false)
  })
})
