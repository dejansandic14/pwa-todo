import { useState } from 'react'
import { strings } from '../strings'

const t = strings.notifications

const supported = 'Notification' in window && 'serviceWorker' in navigator

export default function NotificationsToggle() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  )

  // Must run from a user gesture, otherwise browsers ignore or auto-deny the request.
  async function request() {
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  if (permission === 'default') {
    return (
      <button type="button" className="btn btn--small" onClick={() => void request()}>
        {t.allow}
      </button>
    )
  }

  const label = permission === 'granted' ? t.granted : permission === 'denied' ? t.denied : t.unsupported
  return (
    <span className={`status status--${permission}`} role="status">
      {label}
    </span>
  )
}

/**
 * Shows a local notification through the service worker registration. Using
 * `registration.showNotification` instead of `new Notification()` is what also works inside
 * installed Android PWAs, where page-created notifications are not allowed.
 */
export async function notifyTodoDone(title: string): Promise<void> {
  if (!supported || Notification.permission !== 'granted') return
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(t.doneTitle, {
    body: title,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    tag: 'todo-done',
  })
}
