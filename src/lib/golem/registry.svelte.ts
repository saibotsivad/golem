import type { Registry, RegistryEntry } from './types'

// ── model registry ──────────────────────────────────────────────────────────
// A Svelte 5 runes store tracking the load status of every heavyweight asset.
// Components read `registry` directly and re-render reactively; the golem API
// layer mutates it through `registrySet` / `registryDelete`. This replaces the
// hand-rolled pub/sub (`registrySubscribe`) from the original vanilla build.
export const registry = $state<Registry>({
	'xenova-gpt2': { label: 'GPT-2 tokenizer', size: '~800 KB', status: 'unknown', progress: null },
	'xenova-gpt2-lm': { label: 'GPT-2 LM', size: '~81 MB', status: 'unknown', progress: null },
	'xenova-all-minilm-l6-v2-emb': {
		label: 'all-MiniLM-L6-v2 embedder',
		modelName: 'Xenova/all-MiniLM-L6-v2',
		size: '~23 MB',
		status: 'unknown',
		progress: null,
	},
})

// REGISTRY keys that existed at startup — used to decide whether unloading an
// entry resets it to a cached/absent state or removes it entirely.
export const predeclaredKeys = new Set(Object.keys(registry))

export function registrySet(key: string, update: Partial<RegistryEntry>): void {
	const existing = registry[key]
	if (existing) {
		Object.assign(existing, update)
	} else {
		registry[key] = {
			label: update.label ?? key,
			size: update.size ?? null,
			status: update.status ?? 'unknown',
			progress: update.progress ?? null,
			...update,
		}
	}
}

export function registryHas(key: string): boolean {
	return key in registry
}

export function registryStatus(key: string): RegistryEntry['status'] | undefined {
	return registry[key]?.status
}

export function registryDelete(key: string): void {
	delete registry[key]
}
