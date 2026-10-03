// Minimal promise wrapper around the raw IndexedDB API — no library.

export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: number
}

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

export async function getAllTodos(): Promise<Todo[]> {
  const todos = await request((await store('readonly')).getAll() as IDBRequest<Todo[]>)
  return todos.sort((a, b) => a.createdAt - b.createdAt)
}

/** Inserts or replaces a to-do (the key is `todo.id`). */
export async function putTodo(todo: Todo): Promise<void> {
  await request((await store('readwrite')).put(todo))
}

export async function deleteTodo(id: string): Promise<void> {
  await request((await store('readwrite')).delete(id))
}
