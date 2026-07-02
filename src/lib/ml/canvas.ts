// Canvas rendering helpers for embedding vectors.
// Blue = positive dimensions, red = negative, scaled to a shared magnitude.

export function drawEmbedding(canvas: HTMLCanvasElement, vec: ArrayLike<number>, scale: number): void {
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	const w = canvas.width
	const h = canvas.height
	const n = vec.length
	ctx.clearRect(0, 0, w, h)
	for (let i = 0; i < n; i++) {
		const x0 = Math.floor((i * w) / n)
		const x1 = Math.floor(((i + 1) * w) / n)
		const v = vec[i] / scale // [-1, 1]
		let r: number
		let g: number
		let b: number
		if (v >= 0) {
			const t = Math.min(1, v)
			r = Math.round(255 * (1 - t * 0.5))
			g = Math.round(255 * (1 - t * 0.5))
			b = 255
		} else {
			const t = Math.min(1, -v)
			r = 255
			g = Math.round(255 * (1 - t * 0.5))
			b = Math.round(255 * (1 - t * 0.5))
		}
		ctx.fillStyle = `rgb(${r},${g},${b})`
		ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h)
	}
}

export function drawEmbeddingDiff(
	canvas: HTMLCanvasElement,
	vecA: ArrayLike<number>,
	vecB: ArrayLike<number>,
	scale: number,
): void {
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	const w = canvas.width
	const h = canvas.height
	const n = vecA.length
	ctx.clearRect(0, 0, w, h)
	for (let i = 0; i < n; i++) {
		const x0 = Math.floor((i * w) / n)
		const x1 = Math.floor(((i + 1) * w) / n)
		const diff = Math.abs(vecA[i] - vecB[i]) / (2 * scale) // [0, 1]
		const t = Math.round(255 * (1 - Math.min(1, diff)))
		ctx.fillStyle = `rgb(${t},${t},${t})`
		ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h)
	}
}

export function drawEmbeddingGrid(
	canvas: HTMLCanvasElement,
	vecs: ArrayLike<number>,
	count: number,
	dims: number,
	totalRows?: number,
): void {
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	const w = canvas.width
	const rowH = Math.max(1, Math.floor(canvas.height / (totalRows ?? count)))
	let scale = 0
	for (let i = 0; i < count * dims; i++) scale = Math.max(scale, Math.abs(vecs[i]))
	if (scale === 0) scale = 1
	ctx.clearRect(0, 0, w, canvas.height)
	for (let row = 0; row < count; row++) {
		const y0 = row * rowH
		for (let j = 0; j < dims; j++) {
			const x0 = Math.floor((j * w) / dims)
			const x1 = Math.floor(((j + 1) * w) / dims)
			const v = vecs[row * dims + j] / scale
			let r: number
			let g: number
			let b: number
			if (v >= 0) {
				const t = Math.min(1, v)
				r = Math.round(255 * (1 - t * 0.5))
				g = Math.round(255 * (1 - t * 0.5))
				b = 255
			} else {
				const t = Math.min(1, -v)
				r = 255
				g = Math.round(255 * (1 - t * 0.5))
				b = Math.round(255 * (1 - t * 0.5))
			}
			ctx.fillStyle = `rgb(${r},${g},${b})`
			ctx.fillRect(x0, y0, Math.max(1, x1 - x0), rowH)
		}
	}
}

// Largest absolute component of a vector, used as a rendering scale (never 0).
export function vecScale(vec: ArrayLike<number>): number {
	let max = 0
	for (let i = 0; i < vec.length; i++) if (Math.abs(vec[i]) > max) max = Math.abs(vec[i])
	return max || 1
}
