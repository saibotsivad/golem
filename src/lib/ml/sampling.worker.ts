// GPT-2 autoregressive generation worker (used by §3 sampling, §6 RAG, §8 agent).
// Each section spins up its own instance of this worker so they never contend
// over a single model. Runs many sequential forward passes off the main thread
// to keep the UI responsive.
import { AutoTokenizer, GPT2LMHeadModel, env } from '@xenova/transformers'
import type { SamplingStrategy, SamplingWorkerRequest, SamplingWorkerResponse } from '$lib/golem/types'

env.allowLocalModels = false

// `self` is typed as Window under the DOM lib; the Worker interface exposes the
// correct worker-side postMessage(message, transfer[]) / onmessage signatures.
const ctx = self as unknown as Worker
const post = (msg: SamplingWorkerResponse) => ctx.postMessage(msg)

// Model/tokenizer instance types are loose (v2 typings don't export them cleanly).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenizer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lmModel: any = null
let stopRequested = false

function softmaxWithTemp(logits: ArrayLike<number>, temp: number): Float64Array {
	const n = logits.length
	let max = -Infinity
	for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i]
	const out = new Float64Array(n)
	let sum = 0
	for (let i = 0; i < n; i++) {
		out[i] = Math.exp((logits[i] - max) / temp)
		sum += out[i]
	}
	for (let i = 0; i < n; i++) out[i] /= sum
	return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLastLogits(output: any): Float32Array {
	const { logits } = output
	const seqLen = logits.dims[1]
	const vocabSize = logits.dims[2]
	const offset = (seqLen - 1) * vocabSize
	return logits.data.subarray(offset, offset + vocabSize)
}

function sampleToken(
	probs: Float64Array,
	strategy: SamplingStrategy,
	temp: number,
	k: number,
	p: number,
): { id: number; prob: number } {
	const n = probs.length

	if (strategy === 'greedy') {
		let best = 0
		for (let i = 1; i < n; i++) if (probs[i] > probs[best]) best = i
		return { id: best, prob: probs[best] }
	}

	if (strategy === 'temperature') {
		const r = Math.random()
		let cum = 0
		for (let i = 0; i < n; i++) {
			cum += probs[i]
			if (r <= cum) return { id: i, prob: probs[i] }
		}
		return { id: n - 1, prob: probs[n - 1] }
	}

	const sorted = Array.from({ length: n }, (_, i) => i).sort((a, b) => probs[b] - probs[a])
	let candidates: number[]
	if (strategy === 'topk') {
		candidates = sorted.slice(0, k)
	} else {
		candidates = []
		let cumSum = 0
		for (const i of sorted) {
			candidates.push(i)
			cumSum += probs[i]
			if (cumSum >= p) break
		}
	}

	let sum = 0
	for (const i of candidates) sum += probs[i]
	let r = Math.random() * sum
	for (const i of candidates) {
		r -= probs[i]
		if (r <= 0) return { id: i, prob: probs[i] }
	}
	const last = candidates[candidates.length - 1]
	return { id: last, prob: probs[last] }
}

ctx.onmessage = async ({ data }: MessageEvent<SamplingWorkerRequest>) => {
	if (data.type === 'stop') {
		stopRequested = true
		return
	}
	if (data.type !== 'generate') return

	stopRequested = false
	const { prompt, strategy, temp, k, p, maxTok } = data

	try {
		if (!tokenizer) {
			post({ type: 'status', text: 'Loading tokenizer…' })
			tokenizer = await AutoTokenizer.from_pretrained('Xenova/gpt2')
		}

		if (!lmModel) {
			post({ type: 'model_status', status: 'loading', progress: null })
			lmModel = await GPT2LMHeadModel.from_pretrained('Xenova/gpt2', {
				quantized: true,
				progress_callback: (info: { status: string; progress?: number }) => {
					if (info.status === 'progress') {
						post({ type: 'status', text: `Downloading model: ${(info.progress ?? 0).toFixed(0)}%` })
						post({ type: 'model_status', status: 'downloading', progress: info.progress ?? 0 })
					} else if (info.status === 'done') {
						post({ type: 'status', text: 'Loading model into memory…' })
						post({ type: 'model_status', status: 'loading', progress: null })
					}
				},
			})
			post({ type: 'model_status', status: 'ready', progress: null })
		}

		const GPT2_EOS = 50256
		const generatedIds: number[] = []
		let stepCount = 0
		let stopReason = 'limit reached'

		while (stepCount < maxTok) {
			await new Promise((resolve) => setTimeout(resolve, 0))
			if (stopRequested) {
				stopReason = 'stopped'
				break
			}
			post({ type: 'status', text: `Generating token ${stepCount + 1} / ${maxTok}…` })

			const currentText = prompt + (generatedIds.length ? tokenizer.decode(generatedIds) : '')
			const inputs = tokenizer(currentText, { truncation: true, max_length: 1024 })
			const output = await lmModel(inputs)
			const lastLogits = getLastLogits(output)

			const effectiveTemp = strategy === 'greedy' ? 1.0 : temp
			const probs = softmaxWithTemp(lastLogits, effectiveTemp)
			const { id, prob } = sampleToken(probs, strategy, temp, k, p)

			if (id === GPT2_EOS) {
				stopReason = 'end-of-sequence token'
				break
			}

			generatedIds.push(id)
			post({ type: 'token', text: tokenizer.decode([id]), prob, step: stepCount })
			stepCount++
		}

		const strategyLabel =
			strategy === 'topk'
				? `top-k (k=${k})`
				: strategy === 'topp'
					? `top-p (p=${p})`
					: strategy === 'temperature'
						? `temperature (${temp})`
						: 'greedy'
		post({ type: 'done', stepCount, strategyLabel, stopReason })
	} catch (err) {
		post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
	}
}
