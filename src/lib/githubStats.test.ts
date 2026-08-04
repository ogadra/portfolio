import { describe, expect, it } from 'vite-plus/test';
import { eventLabel, languageRatio } from './githubStats';

describe('languageRatio', () => {
	it('returns the top languages with rounded percentages', () => {
		const langs = ['TypeScript', 'TypeScript', 'Go', 'TypeScript', 'HCL', null, 'Go'];
		expect(languageRatio(langs)).toEqual([
			{ name: 'TypeScript', ratio: 50 },
			{ name: 'Go', ratio: 33 },
			{ name: 'HCL', ratio: 17 },
		]);
	});

	it('keeps only the top languages the caller asked for', () => {
		const langs = ['Go', 'Go', 'Go', 'TypeScript', 'TypeScript', 'HCL', 'Nix'];
		expect(languageRatio(langs, 2)).toEqual([
			{ name: 'Go', ratio: 43 },
			{ name: 'TypeScript', ratio: 29 },
		]);
		// ratios stay shares of the whole set, so a truncated list sums below 100
		expect(languageRatio(langs, 8).map((l) => l.name)).toEqual(['Go', 'TypeScript', 'HCL', 'Nix']);
	});

	it('returns an empty list when no language is known', () => {
		expect(languageRatio([null, null])).toEqual([]);
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
