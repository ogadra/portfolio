// Test-only data. Nothing here reaches a production render: the page falls back
// to these values solely when the GITHUB_STATS var is set, which only the
// Playwright servers do.
import type { GithubStats } from './github';

/**
 * Values the GITHUB_STATS var accepts. The page, the ambient env type and the
 * Playwright servers all read them from here so a typo cannot slip between them.
 */
export const STATS_MODE = {
	fixture: 'fixture',
	offline: 'offline',
} as const;

export type StatsMode = (typeof STATS_MODE)[keyof typeof STATS_MODE];

/**
 * Fixed stats for the browser tests, selected with the GITHUB_STATS var so a
 * Playwright run never reaches api.github.com and never depends on the rate
 * limit or on what the account did that day.
 */
export const FIXTURE_STATS: GithubStats = {
	publicRepos: 42,
	followers: 7,
	languages: [
		{ name: 'TypeScript', ratio: 55 },
		{ name: 'Go', ratio: 30 },
		{ name: 'HCL', ratio: 15 },
	],
	recentCommits: 21,
	dailyCommits: [0, 1, 3, 0, 2, 4, 1, 0, 2, 3, 1, 0, 2, 2],
	log: [
		{ label: 'PUSH ogadra/portfolio', occurredAt: '2026-07-05T23:12:07Z' },
		{ label: 'PULL_REQ ogadra/portfolio', occurredAt: '2026-07-04T08:41:52Z' },
	],
};
