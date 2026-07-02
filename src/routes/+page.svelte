<script lang="ts">
	import SiteHeader from '$lib/components/SiteHeader.svelte'
	import DebugPanel from '$lib/components/DebugPanel.svelte'
	import Tokenization from '$lib/components/sections/Tokenization.svelte'
	import NextToken from '$lib/components/sections/NextToken.svelte'
	import Sampling from '$lib/components/sections/Sampling.svelte'
	import Embeddings from '$lib/components/sections/Embeddings.svelte'
	import SemanticSearch from '$lib/components/sections/SemanticSearch.svelte'
	import Rag from '$lib/components/sections/Rag.svelte'
	import Memory from '$lib/components/sections/Memory.svelte'
	import Agent from '$lib/components/sections/Agent.svelte'
	import { initGolem } from '$lib/golem/golem'

	let debug = $state(false)

	$effect(() => {
		initGolem()
	})
</script>

<SiteHeader {debug} onToggle={() => (debug = !debug)} />
<p><small>Updated <span>{__BUILD_TIME__}</span></small></p>

<div hidden={!debug}>
	<DebugPanel />
</div>

<div id="sections" hidden={debug}>
	<Tokenization />
	<NextToken />
	<Sampling />
	<Embeddings />
	<SemanticSearch />
	<Rag />
	<Memory />
	<Agent />
</div>
