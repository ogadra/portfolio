/** Daily commit counts keyed by UTC 'YYYY-MM-DD'. */
export type CommitHistory = Record<string, number>;

const DAY_MS = 86_400_000;

const dayKey = (t: number): string => new Date(t).toISOString().slice(0, 10);

const utcMidnight = (d: Date): number =>
	Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Merge freshly observed daily counts into the stored history and drop entries
 * older than the retention window. Overlapping days take the larger value so a
 * later, API-truncated read never shrinks a day we already recorded in full.
 */
export const mergeCommitHistory = (
	stored: CommitHistory,
	fresh: CommitHistory,
	now: Date,
	retentionDays = 400,
): CommitHistory => {
	const cutoff = utcMidnight(now) - retentionDays * DAY_MS;
	const out: CommitHistory = {};
	for (const [key, count] of Object.entries(stored)) {
		if (Date.parse(`${key}T00:00:00Z`) >= cutoff) out[key] = count;
	}
	for (const [key, count] of Object.entries(fresh)) {
		if (Date.parse(`${key}T00:00:00Z`) >= cutoff) out[key] = Math.max(out[key] ?? 0, count);
	}
	return out;
};

/** Build a last-N-days count series (oldest → newest) from the history map. */
export const commitSeries = (history: CommitHistory, now: Date, days: number): number[] => {
	const today = utcMidnight(now);
	return Array.from(
		{ length: days },
		(_, i) => history[dayKey(today - (days - 1 - i) * DAY_MS)] ?? 0,
	);
};
