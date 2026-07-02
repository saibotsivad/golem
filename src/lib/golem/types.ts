// Shared types for the golem model/asset layer.

// Lifecycle of a heavyweight asset (tokenizer, LM, embedder, or vector index):
//   unknown → (absent | cached) → loading → downloading (0–100%) → loading → ready | error
//
//   'cached'      = file is in browser storage but not instantiated this session
//   'loading'     = file is in storage, being read/initialized into memory
//   'downloading' = actively fetching from network (progress 0–100)
//   'ready'       = fully loaded and available in memory
export type AssetStatus =
	| 'unknown'
	| 'absent'
	| 'cached'
	| 'loading'
	| 'downloading'
	| 'ready'
	| 'error'

export interface RegistryEntry {
	label: string
	size: string | null
	status: AssetStatus
	progress: number | null
	/** Only present for embedders — the HuggingFace model name, used to clear cache. */
	modelName?: string
}

export type Registry = Record<string, RegistryEntry>

// Progress information forwarded by Transformers.js `progress_callback`.
export interface ProgressInfo {
	status: 'initiate' | 'download' | 'progress' | 'done' | 'ready' | string
	name?: string
	file?: string
	progress?: number
	loaded?: number
	total?: number
}

export type ProgressCallback = (info: ProgressInfo) => void

export interface StoredMemory {
	id: string
	text: string
	vec: Float32Array
}

// ── Web Worker message contracts ────────────────────────────────────────────

export type SamplingStrategy = 'greedy' | 'temperature' | 'topk' | 'topp'

export interface GenerateRequest {
	type: 'generate'
	prompt: string
	strategy: SamplingStrategy
	temp: number
	k: number
	p: number
	maxTok: number
}

export interface StopRequest {
	type: 'stop'
}

export type SamplingWorkerRequest = GenerateRequest | StopRequest

export type SamplingWorkerResponse =
	| { type: 'status'; text: string }
	| { type: 'model_status'; status: AssetStatus; progress: number | null }
	| { type: 'token'; text: string; prob: number; step: number }
	| { type: 'done'; stepCount: number; strategyLabel: string; stopReason: string }
	| { type: 'error'; message: string }

export type EmbedderWorkerRequest =
	| { type: 'load' }
	| { type: 'embed'; id: number; text: string }

export type EmbedderWorkerResponse =
	| { type: 'model_progress'; info: ProgressInfo }
	| { type: 'model_ready' }
	| { type: 'result'; id: number; vec: Float32Array }
	| { type: 'error'; id: number; message: string }
