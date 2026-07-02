// Numeric helpers shared across sections.

// Apply temperature scaling then softmax, returning a probability distribution.
export function softmaxWithTemp(logits: ArrayLike<number>, temp: number): Float64Array {
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

interface LogitsTensor {
	dims: number[]
	data: Float32Array
	subarray?: unknown
}

interface ModelOutput {
	logits: LogitsTensor
}

// Extract the last-token logits from a causal-LM forward pass.
export function getLogits(output: ModelOutput): {
	lastLogits: Float32Array
	seqLen: number
	vocabSize: number
} {
	const { logits } = output
	const seqLen = logits.dims[1]
	const vocabSize = logits.dims[2]
	const offset = (seqLen - 1) * vocabSize
	return { lastLogits: logits.data.subarray(offset, offset + vocabSize), seqLen, vocabSize }
}

// Cosine similarity between two equal-length vectors.
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		na += a[i] ** 2
		nb += b[i] ** 2
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
