export const APPEND_MS = 90;
export const REMOVE_MS = 50;
export const DISPLAY_MS = 2000;
export const EMPTY_MS = 100;

export function wordAnimationDuration(
	wordLength: number,
	appendMs: number = APPEND_MS,
	removeMs: number = REMOVE_MS,
	displayMs: number = DISPLAY_MS,
	emptyMs: number = EMPTY_MS
): number {
	return appendMs * wordLength + displayMs + removeMs * wordLength + emptyMs;
}
