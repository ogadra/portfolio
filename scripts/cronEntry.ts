// Cloudflare Worker entry that wraps the Astro-generated handler and adds a
// `scheduled` handler for Cron Triggers. The Astro Cloudflare adapter only emits
// a `fetch` handler, so scripts/postbuild.ts bundles this file next to
// `entry.mjs` and points the worker `main` at the result.
//
// The scheduled run refreshes the daily commit history stored in D1 directly, so
// each day is recorded before it rolls out of the GitHub commit-search window
// without a request that the page would count as a visit.
import astro from './entry.mjs';
import { fetchGithubStats, type GithubEnv } from '../src/lib/github';

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}

export default {
	fetch: astro.fetch,
	scheduled(_event: unknown, env: GithubEnv, ctx: ExecutionContext) {
		ctx.waitUntil(fetchGithubStats(env));
	},
};
