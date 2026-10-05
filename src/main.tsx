import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { requestPersistentStorage } from './storage'
import './index.css'

// Register the service worker as soon as the page loads.
registerSW({ immediate: true })

// Best effort: ask the browser not to evict the tasks and caches under storage pressure.
void requestPersistentStorage().then((persisted) => {
  console.info('Persistent storage:', persisted ? 'granted' : 'not granted')
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
