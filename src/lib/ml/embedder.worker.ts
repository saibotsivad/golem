// Feature-extraction (embedding) worker. One instance per embedding model; the
// model name is supplied via the first `embed`/`load` message's implied model.
// The original build baked the model name into a generated worker string — here
// the model name is passed through the golem layer when the worker is created
// (see golem.ts, which sets it via the initial `postMessage`).
import { pipeline, env } from '@xenova/transformers'
import type { EmbedderWorkerRequest, EmbedderWorkerResponse, ProgressInfo } from '$lib/golem/types'

env.allowLocalModels = false

// `self` is typed as Window under the DOM lib; the Worker interface exposes the
// correct worker-side postMessage(message, transfer[]) / onmessage signatures.
const ctx = self as unknown as Worker

// The model name is injected by golem.ts via the worker's `name` option.
const MODEL_NAME = self.name || 'Xenova/all-MiniLM-L6-v2'

const post = (msg: EmbedderWorkerResponse, transfer?: Transferable[]) =>
	transfer ? ctx.postMessage(msg, transfer) : ctx.postMessage(msg)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPipe(): Promise<any> {
	if (!pipePromise) {
		pipePromise = pipeline('feature-extraction', MODEL_NAME, {
			quantized: true,
			progress_callback: (info: ProgressInfo) => post({ type: 'model_progress', info }),
		}).then((p) => {
			post({ type: 'model_ready' })
			return p
		})
	}
	return pipePromise
}

ctx.onmessage = async ({ data }: MessageEvent<EmbedderWorkerRequest>) => {
	if (data.type === 'load') {
		await getPipe()
	} else if (data.type === 'embed') {
		try {
			const p = await getPipe()
			const out = await p(data.text, { pooling: 'mean', normalize: true })
			const vec = new Float32Array(out.data)
			post({ type: 'result', id: data.id, vec }, [vec.buffer])
		} catch (err) {
			post({ type: 'error', id: data.id, message: err instanceof Error ? err.message : String(err) })
		}
	}
}
