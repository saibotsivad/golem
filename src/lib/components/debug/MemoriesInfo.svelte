<div class="debug-memories">
	<p class="debug-memories-heading">Memory store (§7)</p>
	<p class="param-note">
		Embedded memories from §7 stored in IndexedDB.<br />
		A ✕ button appears in the state table above while memories are present.
	</p>
	<details class="debug-memories-api">
		<summary>console API</summary>
		<pre>golem.loadMemories()              // &rarr; [{'{'}id, text, vec{'}'}, …]
golem.saveMemory(id, text, vec)   // upsert a memory (id = crypto.randomUUID())
golem.deleteMemory(id)            // delete one memory
golem.clearMemories()             // delete all memories</pre>
	</details>
</div>

<style>
	.debug-memories { margin-top: 1.4rem; }
	.debug-memories-heading { font-weight: bold; margin: 0 0 0.4rem; }
	.debug-memories-api { margin-top: 0.6rem; }
	.debug-memories-api > summary { font-size: 0.8rem; color: #555; cursor: pointer; }
	.debug-memories-api pre { font-size: 0.8rem; font-family: inherit; margin: 0.4rem 0 0; }
</style>
