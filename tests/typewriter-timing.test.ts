import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_TIMINGS, wordAnimationDuration } from '../src/lib/typewriter-timing';

describe('wordAnimationDuration', () => {
	it('returns 3360ms for a 9-character word with default timings', () => {
		expect(wordAnimationDuration(9)).toBe(3360);
	});

	it('scales linearly with word length', () => {
		const t = DEFAULT_TIMINGS;
		const base = t.displayMs + t.emptyMs;
		expect(wordAnimationDuration(0)).toBe(base);
		expect(wordAnimationDuration(1)).toBe(base + t.appendMs + t.removeMs);
		expect(wordAnimationDuration(14)).toBe(base + 14 * (t.appendMs + t.removeMs));
	});

	it('accepts custom timings', () => {
		expect(
			wordAnimationDuration(5, { appendMs: 100, removeMs: 100, displayMs: 1000, emptyMs: 0 })
		).toBe(2000);
	});
});
