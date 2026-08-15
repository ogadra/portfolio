import { describe, expect, it } from 'vite-plus/test';
import { commitBars, languageShare } from './hudPanels';

describe('commitBars', () => {
	it('scales every bar against the busiest day', () => {
		expect(commitBars([4, 2, 1]).map((b) => b.height)).toEqual([100, 50, 25]);
	});

	it('lifts a non-zero day to 14% so a single commit stays visible', () => {
		expect(commitBars([100, 1]).map((b) => b.height)).toEqual([100, 14]);
	});

	it('leaves a silent day as a 4% stub and marks it inactive', () => {
		expect(commitBars([4, 0])).toEqual([
			{ height: 100, active: true },
			{ height: 4, active: false },
		]);
	});

	it('keeps the bars flat when nothing was committed', () => {
		expect(commitBars([0, 0]).map((b) => b.height)).toEqual([4, 4]);
	});
});

describe('languageShare', () => {
	const languages = [
		{ name: 'TypeScript', ratio: 55 },
		{ name: 'Go', ratio: 30 },
	];

	it('reads the ratio of a language the account writes', () => {
		expect(languageShare(languages, 'Go')).toBe(30);
	});

	it('answers null for a language outside the top share', () => {
		expect(languageShare(languages, 'HCL')).toBeNull();
	});

	it('answers null when the account has no language at all', () => {
		expect(languageShare([], 'Go')).toBeNull();
	});
});
