import { useEffect, useState, type FormEvent } from 'react'
import { strings } from '../strings'
import { deleteTodo, getAllTodos, MAX_TITLE_LENGTH, putTodo, type Todo } from '../db'
import TodoItem from './TodoItem'
import { notifyTodoDone } from './NotificationsToggle'

type Filter = 'all' | 'active' | 'done'

const FILTERS: Filter[] = ['all', 'active', 'done']
const t = strings.todos

export default function TodoList() {
  // React state mirrors the IndexedDB `todos` store: load once, then write-through on every change.
  const [todos, setTodos] = useState<Todo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [title, setTitle] = useState('')

  useEffect(() => {
    getAllTodos()
      .then(setTodos)
      .catch((err) => {
        console.error('IndexedDB load failed', err)
        setLoadFailed(true)
      })
      .finally(() => setLoaded(true))
  }, [])

  // React state only changes after IndexedDB confirms the commit, so the list can never
  // show something as saved that is not actually on disk.
  async function write(action: Promise<void>, failure: string): Promise<boolean> {
    try {
      await action
    } catch (err) {
      console.error('IndexedDB write failed', err)
      setError(failure)
      return false
    }
    setError(null)
    return true
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH)
    if (!trimmed) return
    const todo: Todo = { id: crypto.randomUUID(), title: trimmed, done: false, createdAt: Date.now() }
    if (!(await write(putTodo(todo), t.saveError))) return
    setTodos((prev) => [...prev, todo])
    setTitle('')
  }

  async function handleToggle(todo: Todo) {
    const updated = { ...todo, done: !todo.done }
    if (!(await write(putTodo(updated), t.saveError))) return
    setTodos((prev) => prev.map((x) => (x.id === todo.id ? updated : x)))
    if (updated.done) void notifyTodoDone(updated.title).catch((err) => console.warn('Notification failed', err))
  }

  async function handleRename(todo: Todo, newTitle: string) {
    const updated = { ...todo, title: newTitle.slice(0, MAX_TITLE_LENGTH) }
    if (!(await write(putTodo(updated), t.saveError))) return
    setTodos((prev) => prev.map((x) => (x.id === todo.id ? updated : x)))
  }

  async function handleDelete(todo: Todo) {
    if (!(await write(deleteTodo(todo.id), t.deleteError))) return
    setTodos((prev) => prev.filter((x) => x.id !== todo.id))
  }

  const visible = todos.filter((x) => (filter === 'all' ? true : filter === 'active' ? !x.done : x.done))
  const remaining = todos.filter((x) => !x.done).length

  return (
    <section className="card" aria-labelledby="todos-heading">
      <div className="card-header">
        <h2 id="todos-heading">{t.heading}</h2>
        <span className="muted">{t.remaining(remaining)}</span>
      </div>

      <form className="todo-add" onSubmit={handleAdd}>
        <input
          className="input"
          aria-label={t.inputLabel}
          placeholder={t.inputPlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
        />
        <button type="submit" className="btn btn--primary" disabled={!title.trim()}>
          {t.add}
        </button>
      </form>

      <div className="filters" role="group" aria-label={t.filterLabel}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip${filter === f ? ' chip--active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {t.filters[f]}
          </button>
        ))}
      </div>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {!loaded ? null : loadFailed ? (
        <p className="notice notice--error" role="alert">
          {t.loadError}
        </p>
      ) : visible.length === 0 ? (
        <p className="empty">{t.empty[filter]}</p>
      ) : (
        <ul className="todo-list">
          {visible.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
