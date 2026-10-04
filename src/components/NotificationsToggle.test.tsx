import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'

const t = strings.notifications

// The module reads `Notification` and `navigator.serviceWorker` at import time,
// so the globals are stubbed first and the module imported fresh per test.
function stubNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
  vi.stubGlobal('Notification', { permission, requestPermission })
  return { requestPermission }
}

function stubServiceWorker() {
  const showNotification = vi.fn(async () => {})
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ showNotification }) },
  })
  return { showNotification }
}

async function importModule() {
  vi.resetModules()
  return import('./NotificationsToggle')
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('NotificationsToggle', () => {
  it('asks for permission from a user gesture and reports the result', async () => {
    const { requestPermission } = stubNotification('default')
    stubServiceWorker()
    const { default: NotificationsToggle } = await importModule()

    render(<NotificationsToggle />)
    await userEvent.setup().click(screen.getByRole('button', { name: t.allow }))

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(t.granted)).toBeTruthy()
  })

  it('shows the blocked state without a button when permission was denied', async () => {
    stubNotification('denied')
    stubServiceWorker()
    const { default: NotificationsToggle } = await importModule()

    render(<NotificationsToggle />)
    expect(screen.getByText(t.denied)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('notifyTodoDone (system notification path)', () => {
  it('shows the notification through the service worker registration when granted', async () => {
    stubNotification('granted')
    const { showNotification } = stubServiceWorker()
    const { notifyTodoDone } = await importModule()

    await notifyTodoDone('Kupi mlijeko')

    expect(showNotification).toHaveBeenCalledWith(
      t.doneTitle,
      expect.objectContaining({ body: 'Kupi mlijeko', tag: 'todo-done' }),
    )
  })

  it('does nothing when permission is not granted', async () => {
    stubNotification('default')
    const { showNotification } = stubServiceWorker()
    const { notifyTodoDone } = await importModule()

    await notifyTodoDone('Kupi mlijeko')

    expect(showNotification).not.toHaveBeenCalled()
  })
})
