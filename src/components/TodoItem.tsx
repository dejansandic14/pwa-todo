import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { strings } from '../strings'
import type { Todo } from '../db'

interface Props {
  todo: Todo
  onToggle: (todo: Todo) => void
  onRename: (todo: Todo, title: string) => void
  onDelete: (todo: Todo) => void
}

const t = strings.todos

export default function TodoItem({ todo, onToggle, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)

  function startEdit() {
    setDraft(todo.title)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function submitEdit(e: FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (title && title !== todo.title) onRename(todo, title)
    setEditing(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') cancelEdit()
  }

  if (editing) {
    return (
      <li className="todo todo--editing">
        <form className="todo-edit" onSubmit={submitEdit}>
          <input
            className="input"
            aria-label={t.editLabel}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          <button type="submit" className="btn btn--primary">
            {t.save}
          </button>
          <button type="button" className="btn" onClick={cancelEdit}>
            {t.cancel}
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className={`todo${todo.done ? ' todo--done' : ''}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={todo.done}
        onChange={() => onToggle(todo)}
        aria-label={todo.done ? t.markUndone : t.markDone}
      />
      <span className="todo-title">{todo.title}</span>
      <div className="todo-actions">
        <button type="button" className="btn btn--small" onClick={startEdit}>
          {t.edit}
        </button>
        <button type="button" className="btn btn--small btn--danger" onClick={() => onDelete(todo)}>
          {t.remove}
        </button>
      </div>
    </li>
  )
}
