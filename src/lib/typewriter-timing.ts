export interface TypewriterTimings {
	appendMs: number;
	removeMs: number;
	displayMs: number;
	emptyMs: number;
}

export const DEFAULT_TIMINGS: TypewriterTimings = {
	appendMs: 90,
	removeMs: 50,
	displayMs: 2000,
	emptyMs: 100
};

export function wordAnimationDuration(
	wordLength: number,
	t: TypewriterTimings = DEFAULT_TIMINGS
): number {
	return t.appendMs * wordLength + t.displayMs + t.removeMs * wordLength + t.emptyMs;
}
