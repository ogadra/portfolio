import { fetchGithubStats, type GithubEnv } from './github';

/** The slice of the Cloudflare execution context the cron run uses. */
export interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}

/**
 * The cron run, wired up by the `triggers` in wrangler.jsonc. It refreshes the
 * daily commit history held in D1 without a request the page would count as a
 * visit. Twice a day is what the schedule asks for: GitHub's commit search only
 * reaches back a few days, so each day has to be recorded before it rolls out of
 * that window and becomes unrecoverable.
 *
 * A refresh that produced nothing rejects: the page can serve a stale snapshot
 * instead, but a cron run that recorded no day has failed at the one thing it
 * exists for, and a resolved promise would file that away as a success.
 */
export const runScheduled = async (env: GithubEnv, ctx: ExecutionContext): Promise<void> => {
	const stats = await fetchGithubStats(env, (promise) => ctx.waitUntil(promise));
	if (!stats) throw new Error('scheduled refresh produced no stats');
};
