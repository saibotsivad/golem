// ── IndexedDB persistence ────────────────────────────────────────────────────
// Single database 'golem' v4 with five object stores:
//   'search'     — flat Float32Array embedding indices (§5, §6); out-of-line keys
//   'tokenizers' — { key, modelName } entries for tokenizer auto-restore
//   'models'     — { key, modelName } entries for LM auto-restore
//   'embedders'  — { key, modelName } entries for embedder auto-restore
//   'memories'   — { id, text, vec: Float32Array } user-added memories (§7)

export interface ModelRecord {
	key: string
	modelName: string
}

export interface MemoryRecord {
	id: string
	text: string
	vec: Float32Array
}

const DB_NAME = 'golem'
const DB_VERSION = 4

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains('search')) db.createObjectStore('search')
			if (!db.objectStoreNames.contains('tokenizers')) db.createObjectStore('tokenizers', { keyPath: 'key' })
			if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'key' })
			if (!db.objectStoreNames.contains('embedders')) db.createObjectStore('embedders', { keyPath: 'key' })
			if (!db.objectStoreNames.contains('memories')) db.createObjectStore('memories', { keyPath: 'id' })
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
	return dbPromise
}

function request<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return openDb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const req = run(db.transaction(store, mode).objectStore(store))
				req.onsuccess = () => resolve(req.result)
				req.onerror = () => reject(req.error)
			}),
	)
}

function mutate(store: string, run: (s: IDBObjectStore) => void): Promise<void> {
	return openDb().then(
		(db) =>
			new Promise<void>((resolve, reject) => {
				const tx = db.transaction(store, 'readwrite')
				run(tx.objectStore(store))
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
			}),
	)
}

// ── model-name stores (tokenizers / models / embedders) ─────────────────────
type NamedStore = 'tokenizers' | 'models' | 'embedders'

export const idb = {
	getAllModels: (store: NamedStore): Promise<ModelRecord[]> =>
		request<ModelRecord[]>(store, 'readonly', (s) => s.getAll()),
	putModel: (store: NamedStore, key: string, modelName: string): Promise<void> =>
		mutate(store, (s) => s.put({ key, modelName })),
	deleteModel: (store: NamedStore, key: string): Promise<void> => mutate(store, (s) => s.delete(key)),

	// ── search (vector index) store — out-of-line keys, so put(value, key) ────
	getIndex: (key: string): Promise<Float32Array | null> =>
		request<Float32Array | undefined>('search', 'readonly', (s) => s.get(key)).then((v) => v ?? null),
	putIndex: (key: string, value: Float32Array): Promise<void> => mutate('search', (s) => s.put(value, key)),
	deleteIndex: (key: string): Promise<void> => mutate('search', (s) => s.delete(key)),
	getAllIndexKeys: (): Promise<string[]> => request<IDBValidKey[]>('search', 'readonly', (s) => s.getAllKeys()) as Promise<string[]>,

	// ── memories store ────────────────────────────────────────────────────────
	getAllMemories: (): Promise<MemoryRecord[]> => request<MemoryRecord[]>('memories', 'readonly', (s) => s.getAll()),
	putMemory: (id: string, text: string, vec: Float32Array): Promise<void> =>
		mutate('memories', (s) => s.put({ id, text, vec })),
	deleteMemory: (id: string): Promise<void> => mutate('memories', (s) => s.delete(id)),
	clearMemories: (): Promise<void> => mutate('memories', (s) => s.clear()),
}
