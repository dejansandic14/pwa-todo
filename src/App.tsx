import { strings } from './strings'
import InstallButton from './components/InstallButton'
import NotificationsToggle from './components/NotificationsToggle'
import OfflineBanner from './components/OfflineBanner'
import TodoList from './components/TodoList'
import WeatherCard from './components/WeatherCard'

export default function App() {
  return (
    <div className="app">
      <OfflineBanner />
      <header className="app-header">
        <div className="app-header-row">
          <h1>{strings.appTitle}</h1>
          <div className="toolbar">
            <NotificationsToggle />
            <InstallButton />
          </div>
        </div>
        <p className="muted">{strings.appSubtitle}</p>
      </header>
      <main className="app-main">
        <WeatherCard />
        <TodoList />
      </main>
    </div>
  )
}
