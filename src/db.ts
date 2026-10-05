// Minimal promise wrapper around the raw IndexedDB API — no library.

export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: number
}

/** Longest allowed task title; enforced by the inputs and again when saving. */
export const MAX_TITLE_LENGTH = 200

const DB_NAME = 'pwa-todo'
const DB_VERSION = 1
const STORE = 'todos'

let dbPromise: Promise<IDBDatabase> | undefined

/** Turns any IDBRequest into a Promise of its result. */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION)
      // Runs only when the database is created or DB_VERSION is bumped.
      open.onupgradeneeded = () => {
        const db = open.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  }
  return dbPromise
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb()
  return db.transaction(STORE, mode).objectStore(STORE)
}

/**
 * Resolves only when the transaction has fully committed to disk. A request's `success`
 * fires earlier and the transaction can still abort after it (e.g. quota exceeded), so
 * waiting for the request alone could report a write as saved that never landed.
 */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function getAllTodos(): Promise<Todo[]> {
  const todos = await request((await store('readonly')).getAll() as IDBRequest<Todo[]>)
  return todos.sort((a, b) => a.createdAt - b.createdAt)
}

/** Inserts or replaces a to-do (the key is `todo.id`). Resolves after the transaction commits. */
export async function putTodo(todo: Todo): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(todo)
  await committed(tx)
}

/** Removes a to-do. Resolves after the transaction commits. */
export async function deleteTodo(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await committed(tx)
}
