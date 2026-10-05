import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './storage'

function defineNavigatorProp(name: string, value: unknown) {
  Object.defineProperty(window.navigator, name, { configurable: true, value })
}

beforeEach(() => {
  localStorage.clear()
  defineNavigatorProp('storage', undefined)
  defineNavigatorProp('permissions', undefined)
})

describe('requestPersistentStorage', () => {
  it('is a no-op in browsers without the Storage API', async () => {
    expect(await requestPersistentStorage()).toBe(false)
  })

  it('does not ask again when persistence was already granted', async () => {
    const persist = vi.fn(async () => true)
    defineNavigatorProp('storage', { persisted: async () => true, persist })

    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('requests persistence when the permission is already granted (silent everywhere)', async () => {
    const persist = vi.fn(async () => true)
    defineNavigatorProp('storage', { persisted: async () => false, persist })
    defineNavigatorProp('permissions', { query: async () => ({ state: 'granted' }) })

    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('asks at most once when the browser might prompt the user', async () => {
    const persist = vi.fn(async () => false)
    defineNavigatorProp('storage', { persisted: async () => false, persist })
    defineNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) })

    expect(await requestPersistentStorage()).toBe(false)
    expect(persist).toHaveBeenCalledTimes(1)

    // Next app start: the question is not repeated.
    expect(await requestPersistentStorage()).toBe(false)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('still asks (once) when the Permissions API is missing', async () => {
    const persist = vi.fn(async () => true)
    defineNavigatorProp('storage', { persisted: async () => false, persist })

    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('swallows Storage API failures', async () => {
    defineNavigatorProp('storage', {
      persisted: async () => {
        throw new Error('storage broken')
      },
      persist: vi.fn(),
    })

    expect(await requestPersistentStorage()).toBe(false)
  })
})
