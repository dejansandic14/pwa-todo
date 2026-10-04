import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from './db'

// Each `openSession()` is a fresh app launch: a new module instance of db.ts opens a new
// IndexedDB connection against the same backing store (the "disk" set up in beforeEach).
// No network is involved anywhere — IndexedDB is purely local.
async function openSession(): Promise<typeof import('./db')> {
  vi.resetModules()
  return import('./db')
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('to-do storage (IndexedDB, offline)', () => {
  it('creates a task and still finds it after the app was fully closed and reopened', async () => {
    const first = await openSession()
    const todo: Todo = { id: 'a', title: 'Kupi mlijeko', done: false, createdAt: 1 }
    await first.putTodo(todo)

    const second = await openSession()
    expect(await second.getAllTodos()).toEqual([todo])
  })

  it('edits a task and the edit survives another full restart', async () => {
    const first = await openSession()
    await first.putTodo({ id: 'a', title: 'Kupi mlijeko', done: false, createdAt: 1 })

    const second = await openSession()
    const [stored] = await second.getAllTodos()
    await second.putTodo({ ...stored, title: 'Kupi hljeb', done: true })

    const third = await openSession()
    expect(await third.getAllTodos()).toEqual([{ id: 'a', title: 'Kupi hljeb', done: true, createdAt: 1 }])
  })

  it('returns tasks ordered by creation time', async () => {
    const db = await openSession()
    await db.putTodo({ id: 'b', title: 'drugi', done: false, createdAt: 20 })
    await db.putTodo({ id: 'a', title: 'prvi', done: false, createdAt: 10 })

    expect((await db.getAllTodos()).map((t) => t.title)).toEqual(['prvi', 'drugi'])
  })

  it('deletes a task permanently', async () => {
    const first = await openSession()
    await first.putTodo({ id: 'a', title: 'obriši me', done: false, createdAt: 1 })
    await first.deleteTodo('a')

    const second = await openSession()
    expect(await second.getAllTodos()).toEqual([])
  })
})
