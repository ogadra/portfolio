import { describe, expect, it } from 'vite-plus/test';
import {
	APPEND_MS,
	DISPLAY_MS,
	EMPTY_MS,
	REMOVE_MS,
	wordAnimationDuration
} from '../src/lib/typewriterTiming';

describe('wordAnimationDuration', () => {
	it('returns 3360ms for a 9-character word', () => {
		expect(wordAnimationDuration(9)).toBe(3360);
	});

	it('scales linearly with word length', () => {
		const base = DISPLAY_MS + EMPTY_MS;
		expect(wordAnimationDuration(0)).toBe(base);
		expect(wordAnimationDuration(1)).toBe(base + APPEND_MS + REMOVE_MS);
		expect(wordAnimationDuration(14)).toBe(base + 14 * (APPEND_MS + REMOVE_MS));
	});
});
