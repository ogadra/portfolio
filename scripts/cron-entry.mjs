// Cloudflare Worker entry that wraps the Astro-generated handler and adds a
// `scheduled` handler for Cron Triggers. The Astro Cloudflare adapter only
// emits a `fetch` handler, so this file is copied next to `entry.mjs` at build
// time (see scripts/postbuild.mjs) and set as the worker `main`.
//
// The scheduled run simply renders the home page in-process; that render calls
// fetchGithubStats, which refreshes the persisted daily commit history in KV.
// Doing it on a schedule guarantees each day is recorded before it rolls out of
// the GitHub commit-search window, independent of visitor traffic.
import astro from './entry.mjs';

export default {
	fetch: astro.fetch,
	scheduled(_event, env, ctx) {
		ctx.waitUntil(astro.fetch(new Request('https://ogadra.com/'), env, ctx));
	},
};
