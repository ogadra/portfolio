import type { GithubStats } from './github';

/**
 * Test-only data. The page serves it in place of a live fetch when GITHUB_STATS
 * names the fixture mode, so a Playwright run never reaches api.github.com and
 * never depends on the rate limit or on what the account did that day.
 */
export const FIXTURE_STATS: GithubStats = {
	publicRepos: 42,
	followers: 7,
	languages: [
		{ name: 'TypeScript', ratio: 55 },
		{ name: 'Go', ratio: 30 },
		{ name: 'HCL', ratio: 15 },
	],
	recentContributions: 21,
	dailyContributions: [0, 1, 3, 0, 2, 4, 1, 0, 2, 3, 1, 0, 2, 2],
	log: [
		{ label: 'PUSH ogadra/portfolio', occurredAt: '2026-07-05T23:12:07Z' },
		{ label: 'PULL_REQ ogadra/portfolio', occurredAt: '2026-07-04T08:41:52Z' },
	],
};
