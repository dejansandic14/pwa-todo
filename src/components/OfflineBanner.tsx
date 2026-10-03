import { useEffect, useState } from 'react'
import { strings } from '../strings'

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      {strings.offline.banner}
    </div>
  )
}
