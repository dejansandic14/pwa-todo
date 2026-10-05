import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'

const { notifyTodoDone } = vi.hoisted(() => ({ notifyTodoDone: vi.fn(async () => {}) }))
vi.mock('./NotificationsToggle', () => ({ default: () => null, notifyTodoDone }))

const t = strings.todos

// A fresh "device" per test, with the network completely unavailable: every fetch rejects
// and navigator.onLine is false. The list must work purely from IndexedDB.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  notifyTodoDone.mockClear()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
})

async function renderTodoList() {
  const { default: TodoList } = await import('./TodoList')
  return render(<TodoList />)
}

describe('TodoList with no network', () => {
  it('creates and edits a task offline, and it is still there after a remount', async () => {
    const user = userEvent.setup()
    const view = await renderTodoList()
    await screen.findByText(t.empty.all)

    await user.type(screen.getByLabelText(t.inputLabel), 'Platiti račune')
    await user.click(screen.getByRole('button', { name: t.add }))
    await screen.findByText('Platiti račune')

    await user.click(screen.getByRole('button', { name: t.edit }))
    const editBox = screen.getByLabelText(t.editLabel)
    await user.clear(editBox)
    await user.type(editBox, 'Platiti račune za struju')
    await user.click(screen.getByRole('button', { name: t.save }))
    await screen.findByText('Platiti račune za struju')

    // Simulate closing and reopening the app: a brand-new component instance
    // must load the task back from IndexedDB, still without any network.
    view.unmount()
    await renderTodoList()
    await screen.findByText('Platiti račune za struju')

    const db = await import('../db')
    const todos = await db.getAllTodos()
    expect(todos).toHaveLength(1)
    expect(todos[0].title).toBe('Platiti račune za struju')
    expect(window.fetch).not.toHaveBeenCalled()
  })

  it('persists completing and deleting a task to IndexedDB', async () => {
    const user = userEvent.setup()
    await renderTodoList()
    await screen.findByText(t.empty.all)

    await user.type(screen.getByLabelText(t.inputLabel), 'Prvi zadatak')
    await user.click(screen.getByRole('button', { name: t.add }))
    await user.click(await screen.findByRole('checkbox', { name: t.markDone }))

    const db = await import('../db')
    expect((await db.getAllTodos())[0].done).toBe(true)

    await user.click(screen.getByRole('button', { name: t.remove }))
    await screen.findByText(t.empty.all)
    expect(await db.getAllTodos()).toEqual([])
  })

  it('triggers the system notification path when a task is completed', async () => {
    const user = userEvent.setup()
    await renderTodoList()
    await screen.findByText(t.empty.all)

    await user.type(screen.getByLabelText(t.inputLabel), 'Završi me')
    await user.click(screen.getByRole('button', { name: t.add }))
    await user.click(await screen.findByRole('checkbox', { name: t.markDone }))

    expect(notifyTodoDone).toHaveBeenCalledWith('Završi me')

    // Un-completing a task must not notify again.
    notifyTodoDone.mockClear()
    await user.click(screen.getByRole('checkbox', { name: t.markUndone }))
    expect(notifyTodoDone).not.toHaveBeenCalled()
  })

  it('shows an error state — not the empty list — when loading from IndexedDB fails', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB is broken')
      },
    } as unknown as IDBFactory

    await renderTodoList()

    await screen.findByText(t.loadError)
    expect(screen.queryByText(t.empty.all)).toBeNull()
  })

  it('shows a message and keeps the task out of the list when the write fails', async () => {
    const user = userEvent.setup()
    await renderTodoList()
    await screen.findByText(t.empty.all)

    // Sever the IndexedDB connection: every write from now on fails at the transaction level.
    const db = await import('../db')
    ;(await db.openDb()).close()

    await user.type(screen.getByLabelText(t.inputLabel), 'Neće se sačuvati')
    await user.click(screen.getByRole('button', { name: t.add }))

    await screen.findByText(t.saveError)
    // Not shown as saved: the list is still empty and the draft stays in the input.
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.getByText(t.empty.all)).toBeTruthy()
    expect((screen.getByLabelText(t.inputLabel) as HTMLInputElement).value).toBe('Neće se sačuvati')
  })

  it('shows a message and keeps the task listed when deleting fails', async () => {
    const user = userEvent.setup()
    await renderTodoList()
    await screen.findByText(t.empty.all)

    await user.type(screen.getByLabelText(t.inputLabel), 'Ostajem')
    await user.click(screen.getByRole('button', { name: t.add }))
    await screen.findByText('Ostajem')

    const db = await import('../db')
    ;(await db.openDb()).close()

    await user.click(screen.getByRole('button', { name: t.remove }))

    await screen.findByText(t.deleteError)
    expect(screen.getByText('Ostajem')).toBeTruthy()
  })

  it('enforces the 200-character title limit when adding and when editing', async () => {
    const user = userEvent.setup()
    await renderTodoList()
    await screen.findByText(t.empty.all)

    const addInput = screen.getByLabelText(t.inputLabel) as HTMLInputElement
    expect(addInput.maxLength).toBe(200)

    // Bypass the input's maxLength (as a paste through devtools or an old draft could):
    // the save logic itself must clamp to 200.
    fireEvent.change(addInput, { target: { value: 'x'.repeat(250) } })
    await user.click(screen.getByRole('button', { name: t.add }))
    await screen.findByText('x'.repeat(200))

    const db = await import('../db')
    expect((await db.getAllTodos())[0].title).toHaveLength(200)

    await user.click(screen.getByRole('button', { name: t.edit }))
    const editInput = screen.getByLabelText(t.editLabel) as HTMLInputElement
    expect(editInput.maxLength).toBe(200)

    fireEvent.change(editInput, { target: { value: 'y'.repeat(300) } })
    await user.click(screen.getByRole('button', { name: t.save }))
    await screen.findByText('y'.repeat(200))

    await waitFor(async () => {
      expect((await db.getAllTodos())[0].title).toBe('y'.repeat(200))
    })
  })
})
