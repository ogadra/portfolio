/// <reference types="astro/client" />

declare module 'cloudflare:workers' {
	/** Bindings and vars the deployed Worker exposes; see wrangler.jsonc. */
	export const env: {
		DB: import('./lib/githubStore').D1Database;
		GITHUB_CACHE: import('./lib/githubStore').KVNamespace;
		GITHUB_APP_ID: string;
		GITHUB_APP_PRIVATE_KEY: string;
		GITHUB_APP_INSTALLATION_ID: string;
		/** Pins the home page data for the Playwright run; unset means a live fetch. */
		GITHUB_STATS?: import('./lib/statsFixture').StatsMode;
	};
}
