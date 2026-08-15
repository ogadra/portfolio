// Worker entry: the Astro handler plus the `scheduled` export Cron Triggers
// need. scripts/postbuild.ts bundles this file and wires it up as `main`.
//
// The run itself lives in lib/scheduled so it stays testable — `entry.mjs` only
// exists in dist/server after a build, so nothing can import this file.
import astro from './entry.mjs';
import type { GithubEnv } from './lib/github';
import { runScheduled, type ExecutionContext } from './lib/scheduled';

export default {
	fetch: astro.fetch,
	scheduled(_event: unknown, env: GithubEnv, ctx: ExecutionContext) {
		ctx.waitUntil(runScheduled(env, ctx));
	},
};
