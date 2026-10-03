import { useEffect, useState, type FormEvent } from 'react'
import { strings } from '../strings'
import { deleteTodo, getAllTodos, putTodo, type Todo } from '../db'
import TodoItem from './TodoItem'
import { notifyTodoDone } from './NotificationsToggle'

type Filter = 'all' | 'active' | 'done'

const FILTERS: Filter[] = ['all', 'active', 'done']
const t = strings.todos

export default function TodoList() {
  // React state mirrors the IndexedDB `todos` store: load once, then write-through on every change.
  const [todos, setTodos] = useState<Todo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [title, setTitle] = useState('')

  useEffect(() => {
    getAllTodos()
      .then(setTodos)
      .catch((err) => console.error('IndexedDB load failed', err))
      .finally(() => setLoaded(true))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const todo: Todo = { id: crypto.randomUUID(), title: trimmed, done: false, createdAt: Date.now() }
    await putTodo(todo)
    setTodos((prev) => [...prev, todo])
    setTitle('')
  }

  async function handleToggle(todo: Todo) {
    const updated = { ...todo, done: !todo.done }
    await putTodo(updated)
    setTodos((prev) => prev.map((x) => (x.id === todo.id ? updated : x)))
    if (updated.done) void notifyTodoDone(updated.title).catch((err) => console.warn('Notification failed', err))
  }

  async function handleRename(todo: Todo, newTitle: string) {
    const updated = { ...todo, title: newTitle }
    await putTodo(updated)
    setTodos((prev) => prev.map((x) => (x.id === todo.id ? updated : x)))
  }

  async function handleDelete(todo: Todo) {
    await deleteTodo(todo.id)
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
          maxLength={200}
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

      {!loaded ? null : visible.length === 0 ? (
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
