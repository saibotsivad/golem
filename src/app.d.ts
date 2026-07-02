import type { GolemApi } from '$lib/golem/golem'

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		golem: GolemApi
	}

	// Injected by Vite at build time (see vite.config.ts).
	const __BUILD_TIME__: string
}

export {}
