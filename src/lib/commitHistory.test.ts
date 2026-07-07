import { describe, expect, it } from 'vitest';
import { commitSeries, commitsByDay, mergeCommitHistory } from './commitHistory';

describe('commitsByDay', () => {
	it('counts commits per UTC day', () => {
		expect(
			commitsByDay([
				'2026-07-07T01:00:00Z',
				'2026-07-07T23:30:00Z',
				'2026-07-06T10:00:00Z',
				'not-a-date',
			]),
		).toEqual({ '2026-07-07': 2, '2026-07-06': 1 });
	});
});

describe('mergeCommitHistory', () => {
	const now = new Date('2026-07-07T12:00:00Z');

	it('keeps older days and overwrites with fresh counts', () => {
		const stored = { '2026-07-01': 3, '2026-07-06': 5 };
		const fresh = { '2026-07-06': 9, '2026-07-07': 4 };
		expect(mergeCommitHistory(stored, fresh, now)).toEqual({
			'2026-07-01': 3,
			'2026-07-06': 9,
			'2026-07-07': 4,
		});
	});

	it('never shrinks a day a truncated read reports lower', () => {
		const stored = { '2026-07-05': 40 };
		const fresh = { '2026-07-05': 12 };
		expect(mergeCommitHistory(stored, fresh, now)['2026-07-05']).toBe(40);
	});

	it('prunes entries beyond the retention window', () => {
		const stored = { '2025-01-01': 7, '2026-07-06': 2 };
		expect(mergeCommitHistory(stored, {}, now, 30)).toEqual({ '2026-07-06': 2 });
	});
});

describe('commitSeries', () => {
	it('builds an oldest-to-newest series with zeros for missing days', () => {
		const now = new Date('2026-07-07T12:00:00Z');
		const history = { '2026-07-07': 4, '2026-07-05': 6 };
		expect(commitSeries(history, now, 4)).toEqual([0, 6, 0, 4]);
	});
});
