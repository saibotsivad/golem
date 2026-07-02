<script lang="ts">
	import CurrentState from './debug/CurrentState.svelte'
	import LoadTokenizer from './debug/LoadTokenizer.svelte'
	import LoadModel from './debug/LoadModel.svelte'
	import LoadEmbedder from './debug/LoadEmbedder.svelte'
	import MemoriesInfo from './debug/MemoriesInfo.svelte'
</script>

<div id="debug-panel">
	<CurrentState />
	<LoadTokenizer />
	<LoadModel />
	<LoadEmbedder />
	<MemoriesInfo />
</div>
