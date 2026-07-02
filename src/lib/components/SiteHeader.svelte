<script lang="ts">
	interface Props {
		debug: boolean
		onToggle: () => void
	}

	let { debug, onToggle }: Props = $props()
</script>

<div class="site-header">
	<h1>
		golem
		<small>an automaton</small>
	</h1>
	<button type="button" class="debug-toggle" onclick={onToggle}>{debug ? 'back' : 'debug'}</button>
</div>
<p>Proof-of-concept demo of AI core technologies, running entirely in the browser.</p>
