import SamplingWorker from '$lib/ml/sampling.worker?worker'

// Each generation section (§3, §6, §8) creates its own sampling worker instance
// so the loaded GPT-2 model in one never contends with another.
export function createSamplingWorker(): Worker {
	return new SamplingWorker()
}
