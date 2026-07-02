<script lang="ts">
	import { golem } from '$lib/golem/golem'
	import { registry } from '$lib/golem/registry.svelte'
	import type { AssetStatus } from '$lib/golem/types'

	const statusClass: Record<AssetStatus, string> = {
		ready: 'status-ready',
		cached: 'status-cached',
		absent: 'status-absent',
		downloading: 'status-downloading',
		loading: 'status-loading',
		error: 'status-error',
		unknown: 'status-unknown',
	}
	const statusLabel: Record<AssetStatus, string> = {
		ready: 'ready',
		cached: 'cached',
		absent: 'not cached',
		downloading: 'downloading',
		loading: 'initializing…',
		error: 'error',
		unknown: '—',
	}

	// Clear (✕) functions keyed by registry key. Wired reactively below whenever
	// an asset becomes clearable; each fn removes itself so the button vanishes
	// once clicked. This replaces the original _debugClearFns Map + manual pub/sub.
	let clearFns = $state<Record<string, () => Promise<void>>>({})

	function makeClearFn(key: string, run: (key: string) => Promise<void>) {
		return async () => {
			delete clearFns[key]
			await run(key)
		}
	}

	$effect(() => {
		for (const key of Object.keys(registry)) {
			const status = registry[key].status
			if (clearFns[key]) continue
			if (status === 'ready' && golem._isLoaded(key)) {
				clearFns[key] = makeClearFn(key, (k) => golem.unloadTokenizer(k))
			} else if (status === 'ready' && golem._isLMLoaded(key)) {
				clearFns[key] = makeClearFn(key, (k) => golem.unloadLM(k))
			} else if (key.endsWith('-emb') && (status === 'ready' || status === 'cached')) {
				clearFns[key] = makeClearFn(key, (k) => golem.unloadEmb(k))
			} else if (key === 'memories' && status === 'ready') {
				clearFns[key] = makeClearFn(key, () => golem.clearMemories())
			} else if (key in golem.indexes() && (status === 'ready' || status === 'cached')) {
				clearFns[key] = makeClearFn(key, (k) => golem.deleteIndex(k))
			}
		}
	})

	const rows = $derived(Object.entries(registry))
</script>

<p class="debug-legend">
	<em>cached</em> = in browser storage &nbsp;&middot;&nbsp; <em>ready</em> = instantiated this session
</p>
<table class="debug-table">
	<thead>
		<tr><th>Asset</th><th>Size</th><th>Status</th><th></th></tr>
	</thead>
	<tbody>
		{#each rows as [key, entry] (key)}
			<tr>
				<td>{entry.label}</td>
				<td class="size-cell">{entry.size ?? ''}</td>
				<td class={statusClass[entry.status]}>
					{#if entry.status === 'downloading' && entry.progress !== null}
						downloading {entry.progress.toFixed(0)}%
					{:else}
						{statusLabel[entry.status]}
					{/if}
				</td>
				<td>
					{#if clearFns[key]}
						<button type="button" class="debug-clear-btn" onclick={() => clearFns[key]()}>✕</button>
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.debug-legend { margin: 0 0 0.5rem; font-size: 0.85rem; color: #555; }
	.debug-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.8rem; }
	.debug-table th { text-align: left; border-bottom: 1px solid #000; padding: 0.2rem 0.8rem 0.2rem 0; font-weight: normal; color: #555; }
	.debug-table td { padding: 0.25rem 0.8rem 0.25rem 0; }
	.size-cell { color: #999; }
	.status-ready { color: #060; }
	.status-cached { color: #555; }
	.status-absent { color: #bbb; }
	.status-downloading { color: #660; }
	.status-loading { color: #660; }
	.status-error { color: #c00; }
	.status-unknown { color: #ccc; }
	.debug-clear-btn { background: none; border: none; color: #aaa; cursor: pointer; font-family: inherit; font-size: 0.85rem; padding: 0; margin: 0; }
</style>
