import { describe, expect, it } from 'vite-plus/test';
import { formatHudDate, formatHudTime, formatLogStamp } from './hudClock';

describe('hudClock', () => {
	it('formats dates as YYYY.MM.DD', () => {
		expect(formatHudDate(new Date(2026, 6, 5))).toBe('2026.07.05');
	});

	it('formats times as HH:MM:SS with zero padding', () => {
		expect(formatHudTime(new Date(2026, 6, 5, 9, 8, 7))).toBe('09:08:07');
	});
});

describe('formatLogStamp', () => {
	it('reads the month, the day and the time out of an instant', () => {
		expect(formatLogStamp('2026-07-05T23:12:07Z')).toBe('07/05 23:12');
	});

	it('reports the UTC the API sends rather than a local time', () => {
		expect(formatLogStamp('2026-01-01T00:30:00Z')).toBe('01/01 00:30');
	});
});
