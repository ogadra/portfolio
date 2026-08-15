/**
 * Values the GITHUB_STATS var accepts. The page, the ambient env type and the
 * Playwright servers all read them from here so a typo cannot slip between them.
 * Only a Playwright run sets the var; a deployed render leaves it unset and
 * fetches live.
 */
export const STATS_MODE = {
	fixture: 'fixture',
	offline: 'offline',
} as const;

export type StatsMode = (typeof STATS_MODE)[keyof typeof STATS_MODE];
