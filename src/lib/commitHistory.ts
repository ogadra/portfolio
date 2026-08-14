import { Temporal } from 'temporal-polyfill';

export type CommitHistory = Record<string, number>;

/**
 * The UTC day an instant falls in. Commit counts are keyed by the day GitHub's
 * commit search reports them under, which is UTC regardless of where the run
 * happens, and `PlainDate` stringifies to exactly that `YYYY-MM-DD` key.
 */
export const utcDay = (now: Temporal.Instant): Temporal.PlainDate =>
	now.toZonedDateTimeISO('UTC').toPlainDate();

export const commitSeries = (
	history: CommitHistory,
	now: Temporal.Instant,
	days: number,
): number[] => {
	const today = utcDay(now);
	return Array.from(
		{ length: days },
		(_, i) => history[today.subtract({ days: days - 1 - i }).toString()] ?? 0,
	);
};
