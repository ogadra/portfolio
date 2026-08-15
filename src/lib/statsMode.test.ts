import { describe, expect, it } from 'vite-plus/test';
import { parseStatsMode, STATS_MODE } from './statsMode';

describe('parseStatsMode', () => {
	it('returns undefined when the var is unset', () => {
		expect(parseStatsMode(undefined)).toBeUndefined();
	});

	it('accepts the fixture mode', () => {
		expect(parseStatsMode('fixture')).toBe(STATS_MODE.fixture);
	});

	it('accepts the offline mode', () => {
		expect(parseStatsMode('offline')).toBe(STATS_MODE.offline);
	});

	it('throws on a value that is neither mode', () => {
		expect(() => parseStatsMode('fixtrue')).toThrow(/GITHUB_STATS/);
	});
});
