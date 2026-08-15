/**
 * Values the GITHUB_STATS var accepts. The stats resolver and the Playwright
 * servers both read them from here so a typo cannot slip between them.
 * Only a Playwright run sets the var; a deployed render leaves it unset and
 * fetches live.
 */
export const STATS_MODE = {
	fixture: 'fixture',
	offline: 'offline',
} as const;

export type StatsMode = (typeof STATS_MODE)[keyof typeof STATS_MODE];

const MODES: readonly string[] = Object.values(STATS_MODE);

/** Reads the var, refusing anything that is neither unset nor a known mode. */
export const parseStatsMode = (value: string | undefined): StatsMode | undefined => {
	if (value === undefined) return undefined;
	if (!MODES.includes(value)) {
		throw new Error(
			`GITHUB_STATS must be one of ${MODES.join(', ')}, got ${JSON.stringify(value)}`,
		);
	}
	return value as StatsMode;
};
