import { describe, expect, it } from 'vitest';
import { formatHudDate, formatHudTime } from './hudClock';

describe('hudClock', () => {
	it('formats dates as YYYY.MM.DD', () => {
		expect(formatHudDate(new Date(2026, 6, 5))).toBe('2026.07.05');
	});

	it('formats times as HH:MM:SS with zero padding', () => {
		expect(formatHudTime(new Date(2026, 6, 5, 9, 8, 7))).toBe('09:08:07');
	});
});
