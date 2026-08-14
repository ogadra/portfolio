import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vite-plus/test';
import { commitSeries } from './commitHistory';

describe('commitSeries', () => {
	it('builds an oldest-to-newest series with zeros for missing days', () => {
		const now = Temporal.Instant.from('2026-07-07T12:00:00Z');
		const history = { '2026-07-07': 4, '2026-07-05': 6 };
		expect(commitSeries(history, now, 4)).toEqual([0, 6, 0, 4]);
	});
});
