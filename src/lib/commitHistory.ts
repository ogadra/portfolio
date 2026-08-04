export type CommitHistory = Record<string, number>;

export const DAY_MS = 86_400_000;

export const dayKey = (t: number): string => new Date(t).toISOString().slice(0, 10);

export const utcMidnight = (d: Date): number =>
	Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export const commitSeries = (history: CommitHistory, now: Date, days: number): number[] => {
	const today = utcMidnight(now);
	return Array.from(
		{ length: days },
		(_, i) => history[dayKey(today - (days - 1 - i) * DAY_MS)] ?? 0,
	);
};
