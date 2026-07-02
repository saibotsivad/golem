// ── golem: model / asset management layer ────────────────────────────────────
// Typed reimplementation of the original window.golem developer API. Internal
// modules import this directly; it is also attached to `window.golem` (see
// registerGolem) so the same console-driven workflow described in the docs
// still works in DevTools.
import EmbedderWorker from '$lib/ml/embedder.worker?worker'
import { idb } from './idb'
import { predeclaredKeys, registry, registryDelete, registrySet } from './registry.svelte'
import type { ProgressCallback, ProgressInfo, StoredMemory } from './types'

// Transformers.js is loaded lazily & browser-only so it never bundles into the
// prerender/SSR pass. onnxruntime handles its own WASM/CDN fetching.
type TransformersModule = typeof import('@xenova/transformers')
let transformersPromise: Promise<TransformersModule> | null = null
function transformers(): Promise<TransformersModule> {
	if (!transformersPromise) {
		transformersPromise = import('@xenova/transformers').then((mod) => {
			mod.env.allowLocalModels = false
			return mod
		})
	}
	return transformersPromise
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tokenizer = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CausalLM = any

interface EmbedderEntry {
	worker: Worker
	nextId: number
	pending: Map<number, { resolve: (v: number[]) => void; reject: (e: Error) => void }>
	progressListeners: Set<ProgressCallback>
}

const loadedTokenizers = new Map<string, Tokenizer>()
const loadedLMs = new Map<string, CausalLM>()
const loadedEmbedders = new Map<string, EmbedderEntry>()
const indexKeys = new Set<string>()

function modelNameToKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

// ── embedder worker factory ──────────────────────────────────────────────────
// The model name is injected via the Worker `name` option (read as `self.name`
// inside embedder.worker.ts), replacing the old generated-source approach.
function makeEmbedderWorker(modelName: string): Worker {
	return new EmbedderWorker({ name: modelName })
}

export interface GolemApi {
	modelKey(name: string): string
	_isLoaded(key: string): boolean
	_isLMLoaded(key: string): boolean
	_isEmbLoaded(key: string): boolean
	_isModelLoaded(): boolean
	loadTokenizer(modelName: string, saveLocally?: boolean): Promise<Tokenizer>
	unloadTokenizer(key: string): Promise<void>
	tokenizers(): Record<string, string>
	tokenize(key: string, text: string, cb?: (piece: string, id: number, index: number) => void): { piece: string; id: number }[]
	decode(key: string, ids: number[]): string
	loadLM(modelName: string, saveLocally?: boolean, onProgress?: ProgressCallback | null): Promise<CausalLM>
	unloadLM(key: string): Promise<void>
	models(): Record<string, string>
	loadModel(onProgress?: ProgressCallback): Promise<CausalLM>
	unloadModel(): Promise<void>
	loadEmb(modelName: string, saveLocally?: boolean, onProgress?: ProgressCallback | null): Promise<void>
	unloadEmb(key: string): Promise<void>
	embedders(): Record<string, string>
	embedWith(key: string, text: string): Promise<number[]>
	loadEmbedder(onProgress?: ProgressCallback): Promise<void>
	embed(text: string): Promise<number[]>
	loadIndex(key: string, label: string): Promise<Float32Array | null>
	saveIndex(key: string, label: string, data: Float32Array): Promise<void>
	deleteIndex(key: string): Promise<void>
	indexes(): Record<string, string>
	loadMemories(): Promise<StoredMemory[]>
	saveMemory(id: string, text: string, vec: Float32Array): Promise<void>
	deleteMemory(id: string): Promise<void>
	clearMemories(): Promise<void>
}

export const golem: GolemApi = {
	modelKey(name) {
		return modelNameToKey(name)
	},

	_isLoaded(key) {
		return loadedTokenizers.has(key)
	},
	_isLMLoaded(key) {
		return loadedLMs.has(key)
	},
	_isEmbLoaded(key) {
		return loadedEmbedders.has(key)
	},
	_isModelLoaded() {
		return loadedLMs.has('xenova-gpt2-lm')
	},

	// ── tokenizers ────────────────────────────────────────────────────────────
	async loadTokenizer(modelName, saveLocally = true) {
		const key = modelNameToKey(modelName)
		if (loadedTokenizers.has(key)) return loadedTokenizers.get(key)

		const wasPreregistered = key in registry
		if (!wasPreregistered) registrySet(key, { label: modelName, size: null, status: 'loading', progress: null })
		registrySet(key, { status: 'loading' })

		try {
			const { AutoTokenizer } = await transformers()
			const tok = await AutoTokenizer.from_pretrained(modelName, {
				progress_callback: (info: ProgressInfo) => {
					if (info.status === 'progress') registrySet(key, { status: 'downloading', progress: info.progress ?? 0 })
					else if (info.status === 'done') registrySet(key, { status: 'loading', progress: null })
				},
			})
			loadedTokenizers.set(key, tok)
			if (saveLocally) await idb.putModel('tokenizers', key, modelName)
			registrySet(key, { status: 'ready', progress: null })
			return tok
		} catch (err) {
			if (wasPreregistered) registrySet(key, { status: 'error' })
			else registryDelete(key)
			throw err
		}
	},

	async unloadTokenizer(key) {
		loadedTokenizers.delete(key)
		try {
			await idb.deleteModel('tokenizers', key)
		} catch {
			/* ignore */
		}
		registryDelete(key)
	},

	tokenizers() {
		const out: Record<string, string> = {}
		for (const key of loadedTokenizers.keys()) out[key] = registry[key]?.status ?? 'ready'
		return out
	},

	tokenize(key, text, cb) {
		const tok = loadedTokenizers.get(key)
		if (!tok) {
			const status = registry[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		const encoded = tok(text, { add_special_tokens: false })
		const ids: number[] = Array.from(encoded.input_ids.data as ArrayLike<bigint | number>).map((v) => Number(v))
		const tokens = ids.map((id) => ({ piece: tok.decode([id], { skip_special_tokens: false }), id }))
		if (cb) for (let i = 0; i < tokens.length; i++) cb(tokens[i].piece, tokens[i].id, i)
		return tokens
	},

	decode(key, ids) {
		const tok = loadedTokenizers.get(key)
		if (!tok) {
			const status = registry[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		return tok.decode(ids, { skip_special_tokens: true })
	},

	// ── causal LMs ──────────────────────────────────────────────────────────────
	async loadLM(modelName, saveLocally = true, onProgress = null) {
		const key = modelNameToKey(modelName) + '-lm'
		if (loadedLMs.has(key)) return loadedLMs.get(key)

		if (!(key in registry)) registrySet(key, { label: modelName, size: null, status: 'loading', progress: null })
		registrySet(key, { status: 'loading' })

		try {
			const { AutoModelForCausalLM } = await transformers()
			const model = await AutoModelForCausalLM.from_pretrained(modelName, {
				quantized: true,
				progress_callback: (info: ProgressInfo) => {
					if (info.status === 'progress') {
						registrySet(key, { status: 'downloading', progress: info.progress ?? 0 })
						onProgress?.(info)
					} else if (info.status === 'done') {
						registrySet(key, { status: 'loading', progress: null })
						onProgress?.(info)
					}
				},
			})
			loadedLMs.set(key, model)
			if (saveLocally) await idb.putModel('models', key, modelName)
			registrySet(key, { status: 'ready', progress: null })
			return model
		} catch (err) {
			if (predeclaredKeys.has(key)) registrySet(key, { status: 'error' })
			else registryDelete(key)
			throw err
		}
	},

	async unloadLM(key) {
		loadedLMs.delete(key)
		try {
			await idb.deleteModel('models', key)
		} catch {
			/* ignore */
		}
		if (predeclaredKeys.has(key)) registrySet(key, { status: 'cached', progress: null })
		else registryDelete(key)
	},

	models() {
		const out: Record<string, string> = {}
		for (const key of loadedLMs.keys()) out[key] = registry[key]?.status ?? 'ready'
		return out
	},

	async loadModel(onProgress) {
		return golem.loadLM('Xenova/gpt2', false, onProgress)
	},

	async unloadModel() {
		return golem.unloadLM('xenova-gpt2-lm')
	},

	// ── embedders ────────────────────────────────────────────────────────────────
	async loadEmb(modelName, saveLocally = true, onProgress = null) {
		const key = modelNameToKey(modelName) + '-emb'
		if (loadedEmbedders.has(key)) {
			onProgress?.({ status: 'ready' })
			return
		}

		if (!(key in registry)) registrySet(key, { label: modelName, modelName, size: null, status: 'loading', progress: null })
		registrySet(key, { status: 'loading', progress: null })

		const worker = makeEmbedderWorker(modelName)
		const entry: EmbedderEntry = { worker, nextId: 0, pending: new Map(), progressListeners: new Set() }
		if (onProgress) entry.progressListeners.add(onProgress)

		const readyPromise = new Promise<void>((resolve, reject) => {
			worker.onmessage = ({ data }) => {
				if (data.type === 'model_progress') {
					const info: ProgressInfo = data.info
					if (info.status === 'progress') registrySet(key, { status: 'downloading', progress: info.progress ?? 0 })
					else if (info.status === 'done') registrySet(key, { status: 'loading', progress: null })
					for (const fn of entry.progressListeners) fn(info)
				} else if (data.type === 'model_ready') {
					resolve()
				} else if (data.type === 'result') {
					const cb = entry.pending.get(data.id)
					if (cb) {
						entry.pending.delete(data.id)
						cb.resolve(Array.from(data.vec as Float32Array))
					}
				} else if (data.type === 'error') {
					const cb = entry.pending.get(data.id)
					if (cb) {
						entry.pending.delete(data.id)
						cb.reject(new Error(data.message))
					} else {
						reject(new Error(data.message))
					}
				}
			}
			worker.onerror = (err) => reject(err instanceof ErrorEvent ? new Error(err.message) : new Error('Worker error'))
		})

		worker.postMessage({ type: 'load' })
		try {
			await readyPromise
		} catch (err) {
			worker.terminate()
			if (predeclaredKeys.has(key)) registrySet(key, { status: 'error' })
			else registryDelete(key)
			throw err
		}

		loadedEmbedders.set(key, entry)
		if (saveLocally) await idb.putModel('embedders', key, modelName)
		registrySet(key, { status: 'ready', progress: null })
		if (onProgress) entry.progressListeners.delete(onProgress)
	},

	async unloadEmb(key) {
		const entry = loadedEmbedders.get(key)
		if (entry) {
			for (const [, cb] of entry.pending) cb.reject(new Error('Embedder unloaded'))
			entry.pending.clear()
			entry.worker.terminate()
			loadedEmbedders.delete(key)
		}
		try {
			await idb.deleteModel('embedders', key)
		} catch {
			/* ignore */
		}
		const modelName = registry[key]?.modelName
		if (modelName) {
			try {
				const cache = await caches.open('transformers-cache')
				const requests = await cache.keys()
				await Promise.all(requests.filter((r) => r.url.includes(modelName)).map((r) => cache.delete(r)))
			} catch {
				/* ignore */
			}
		}
		if (predeclaredKeys.has(key)) registrySet(key, { status: 'absent', progress: null })
		else registryDelete(key)
	},

	embedders() {
		const out: Record<string, string> = {}
		for (const key of loadedEmbedders.keys()) out[key] = registry[key]?.status ?? 'ready'
		return out
	},

	async embedWith(key, text) {
		const entry = loadedEmbedders.get(key)
		if (!entry) throw new Error(`Embedder "${key}" is not loaded — call golem.loadEmb() first`)
		const id = entry.nextId++
		return new Promise<number[]>((resolve, reject) => {
			entry.pending.set(id, { resolve, reject })
			entry.worker.postMessage({ type: 'embed', id, text })
		})
	},

	async loadEmbedder(onProgress) {
		return golem.loadEmb('Xenova/all-MiniLM-L6-v2', false, onProgress)
	},

	async embed(text) {
		await golem.loadEmbedder()
		return golem.embedWith('xenova-all-minilm-l6-v2-emb', text)
	},

	// ── vector indices ────────────────────────────────────────────────────────
	async loadIndex(key, label) {
		if (!(key in registry)) registrySet(key, { label, size: null, status: 'unknown', progress: null })
		else if (label) registrySet(key, { label })
		indexKeys.add(key)
		try {
			const data = await idb.getIndex(key)
			registrySet(key, { status: data ? 'ready' : 'absent' })
			return data ?? null
		} catch {
			registrySet(key, { status: 'absent' })
			return null
		}
	},

	async saveIndex(key, label, data) {
		if (!(key in registry)) registrySet(key, { label, size: null, status: 'unknown', progress: null })
		else if (label) registrySet(key, { label })
		indexKeys.add(key)
		await idb.putIndex(key, data)
		registrySet(key, { status: 'ready', progress: null })
	},

	async deleteIndex(key) {
		await idb.deleteIndex(key)
		if (registry[key]) registrySet(key, { status: 'absent', progress: null })
	},

	indexes() {
		const out: Record<string, string> = {}
		for (const key of indexKeys) out[key] = registry[key]?.status ?? 'unknown'
		return out
	},

	// ── memories ────────────────────────────────────────────────────────────────
	async loadMemories() {
		if (!('memories' in registry)) registrySet('memories', { label: 'Memory store', size: null, status: 'unknown', progress: null })
		try {
			const records = await idb.getAllMemories()
			registrySet('memories', { status: records.length > 0 ? 'ready' : 'absent' })
			return records.map((r) => ({
				id: r.id,
				text: r.text,
				vec: r.vec instanceof Float32Array ? r.vec : new Float32Array(r.vec),
			}))
		} catch {
			registrySet('memories', { status: 'absent' })
			return []
		}
	},

	async saveMemory(id, text, vec) {
		if (!('memories' in registry)) registrySet('memories', { label: 'Memory store', size: null, status: 'unknown', progress: null })
		await idb.putMemory(id, text, vec)
		registrySet('memories', { status: 'ready' })
	},

	async deleteMemory(id) {
		await idb.deleteMemory(id)
	},

	async clearMemories() {
		await idb.clearMemories()
		if (registry['memories']) registrySet('memories', { status: 'absent' })
	},
}

// Probe the browser Cache API (used by Transformers.js) to detect pre-cached
// files. Only updates entries still in the 'unknown' state so it never
// clobbers a live loading/ready status.
async function probeTransformersCache(): Promise<void> {
	try {
		const cache = await caches.open('transformers-cache')
		const urls = (await cache.keys()).map((r) => r.url)
		if (registry['xenova-gpt2'].status === 'unknown')
			registrySet('xenova-gpt2', {
				status: urls.some((u) => u.includes('Xenova/gpt2') && /tokenizer|vocab|merges/.test(u)) ? 'cached' : 'absent',
			})
		if (registry['xenova-gpt2-lm'].status === 'unknown')
			registrySet('xenova-gpt2-lm', {
				status: urls.some((u) => u.includes('Xenova/gpt2') && u.includes('onnx')) ? 'cached' : 'absent',
			})
		if (registry['xenova-all-minilm-l6-v2-emb'].status === 'unknown')
			registrySet('xenova-all-minilm-l6-v2-emb', {
				status: urls.some((u) => u.includes('Xenova/all-MiniLM-L6-v2')) ? 'cached' : 'absent',
			})
	} catch {
		/* Cache API unavailable — statuses stay 'unknown' */
	}
}

let initialized = false

// Wire up window.golem, probe the cache, and auto-restore assets saved in
// previous sessions. Idempotent — safe to call on every mount.
export function initGolem(): void {
	if (initialized || typeof window === 'undefined') return
	initialized = true
	window.golem = golem

	probeTransformersCache()

	void (async () => {
		let saved: { modelName: string }[]
		try {
			saved = await idb.getAllModels('tokenizers')
		} catch {
			return
		}
		for (const { modelName } of saved) {
			try {
				await golem.loadTokenizer(modelName, false)
			} catch {
				/* ignore */
			}
		}
	})()

	void (async () => {
		let saved: { modelName: string }[]
		try {
			saved = await idb.getAllModels('models')
		} catch {
			return
		}
		for (const { modelName } of saved) {
			try {
				await golem.loadLM(modelName, false)
			} catch {
				/* ignore */
			}
		}
	})()

	void (async () => {
		let saved: { modelName: string }[]
		try {
			saved = await idb.getAllModels('embedders')
		} catch {
			return
		}
		for (const { modelName } of saved) {
			try {
				await golem.loadEmb(modelName, false)
			} catch {
				/* ignore */
			}
		}
	})()

	void (async () => {
		let keys: string[]
		try {
			keys = await idb.getAllIndexKeys()
		} catch {
			return
		}
		for (const key of keys) {
			indexKeys.add(key)
			if (!(key in registry)) registrySet(key, { label: key, size: null, status: 'cached', progress: null })
			else if (registry[key].status === 'unknown') registrySet(key, { status: 'cached' })
		}
	})()
}
