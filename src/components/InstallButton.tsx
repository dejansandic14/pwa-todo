import { useEffect, useState } from 'react'
import { strings } from '../strings'

// Chromium-only event; not in lib.dom, so declared here.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches

export default function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return

    const onBeforeInstallPrompt = (e: Event) => {
      // Stop the browser's own mini-infobar and keep the event for our button.
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPromptEvent(null)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Browsers that never fire beforeinstallprompt (Safari, Firefox) simply never show the button.
  if (!promptEvent) return null

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    console.info('Install prompt outcome:', outcome)
    // The event can be used only once; hide the button either way.
    setPromptEvent(null)
  }

  return (
    <button type="button" className="btn btn--primary btn--small" onClick={() => void install()}>
      {strings.install.button}
    </button>
  )
}
