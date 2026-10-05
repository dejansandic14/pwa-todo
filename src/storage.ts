/**
 * Asks the browser to mark this origin's storage (IndexedDB tasks, caches) as persistent,
 * so it is not evicted under storage pressure.
 *
 * Chromium decides `persist()` silently, but Firefox shows a permission prompt. To avoid
 * nagging on every start, the question is asked at most once (remembered in localStorage) —
 * except when the Permissions API reports the permission as already granted, in which case
 * `persist()` is a silent formality that actually turns persistence on.
 *
 * Browsers without the Storage API (or with it disabled) are simply skipped.
 *
 * @returns whether the storage is persistent after the call.
 */
const ASKED_KEY = 'pwa-todo-persist-asked'

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage
    if (!storage?.persist) return false
    if (await storage.persisted()) return true

    const permission = await navigator.permissions
      ?.query({ name: 'persistent-storage' as PermissionName })
      .catch(() => null)
    if (permission?.state === 'granted') return await storage.persist()

    if (localStorage.getItem(ASKED_KEY) !== null) return false
    localStorage.setItem(ASKED_KEY, new Date().toISOString())
    return await storage.persist()
  } catch {
    return false
  }
}
