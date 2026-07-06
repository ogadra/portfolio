import { describe, expect, it } from 'vitest';
import { bucketByDay, eventLabel, languageRatio } from './githubStats';

describe('languageRatio', () => {
	it('returns the top languages with rounded percentages', () => {
		const langs = ['TypeScript', 'TypeScript', 'Go', 'TypeScript', 'HCL', null, 'Go'];
		expect(languageRatio(langs)).toEqual([
			{ name: 'TypeScript', ratio: 50 },
			{ name: 'Go', ratio: 33 },
			{ name: 'HCL', ratio: 17 },
		]);
	});

	it('returns an empty list when no language is known', () => {
		expect(languageRatio([null, null])).toEqual([]);
	});
});

describe('bucketByDay', () => {
	it('buckets ISO dates into oldest-to-newest day counts', () => {
		const now = new Date('2026-07-05T12:00:00Z');
		const dates = [
			'2026-07-05T01:00:00Z',
			'2026-07-05T23:00:00Z',
			'2026-07-04T10:00:00Z',
			'2026-07-03T10:00:00Z',
			'2026-06-01T10:00:00Z',
		];
		expect(bucketByDay(dates, now, 3)).toEqual([1, 1, 2]);
	});

	it('ignores invalid dates', () => {
		const now = new Date('2026-07-05T12:00:00Z');
		expect(bucketByDay(['not-a-date'], now, 2)).toEqual([0, 0]);
	});
});

describe('eventLabel', () => {
	it('maps known GitHub event types to short labels', () => {
		expect(eventLabel('PushEvent')).toBe('PUSH');
		expect(eventLabel('PullRequestEvent')).toBe('PULL_REQ');
	});

	it('falls back to the uppercased type name', () => {
		expect(eventLabel('GollumEvent')).toBe('GOLLUM');
	});
});
