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

  it('rejects writes once the connection is gone, instead of pretending they were saved', async () => {
    const db = await openSession()
    await db.putTodo({ id: 'a', title: 'prije zatvaranja', done: false, createdAt: 1 })
    ;(await db.openDb()).close()

    await expect(db.putTodo({ id: 'b', title: 'poslije zatvaranja', done: false, createdAt: 2 })).rejects.toThrow()
    await expect(db.deleteTodo('a')).rejects.toThrow()

    const reopened = await openSession()
    expect((await reopened.getAllTodos()).map((t) => t.id)).toEqual(['a'])
  })
})

// A hand-rolled IndexedDB where the test controls exactly when the transaction's events fire,
// to pin down the durability contract: a write counts only when the transaction commits.
describe('write durability (transaction lifecycle)', () => {
  interface FakeTransaction {
    error: DOMException | null
    oncomplete?: () => void
    onerror?: () => void
    onabort?: () => void
    objectStore: () => { put: () => object; delete: () => object }
  }

  function installFakeIndexedDB(): FakeTransaction {
    const tx: FakeTransaction = {
      error: null,
      objectStore: () => ({ put: () => ({}), delete: () => ({}) }),
    }
    const open = {
      result: { transaction: () => tx },
      onsuccess: undefined as (() => void) | undefined,
    }
    globalThis.indexedDB = {
      open: () => {
        queueMicrotask(() => open.onsuccess?.())
        return open
      },
    } as unknown as IDBFactory
    return tx
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve))

  it('putTodo stays pending until the transaction commits, then resolves', async () => {
    const tx = installFakeIndexedDB()
    const db = await openSession()

    let settled = false
    const write = db.putTodo({ id: 'a', title: 'čekam upis', done: false, createdAt: 1 }).then(() => {
      settled = true
    })
    await tick()
    // The request may have "succeeded" by now, but the transaction has not committed.
    expect(settled).toBe(false)

    tx.oncomplete?.()
    await write
    expect(settled).toBe(true)
  })

  it('putTodo rejects when the transaction aborts (e.g. quota exceeded after request success)', async () => {
    const tx = installFakeIndexedDB()
    const db = await openSession()

    const write = db.putTodo({ id: 'a', title: 'neće stati', done: false, createdAt: 1 })
    await tick()
    tx.error = new DOMException('quota', 'QuotaExceededError')
    tx.onabort?.()

    await expect(write).rejects.toThrow('quota')
  })

  it('deleteTodo rejects when the transaction errors', async () => {
    const tx = installFakeIndexedDB()
    const db = await openSession()

    const removal = db.deleteTodo('a')
    await tick()
    tx.error = new DOMException('disk', 'UnknownError')
    tx.onerror?.()

    await expect(removal).rejects.toThrow('disk')
  })
})
