export const APPEND_MS = 90;
export const REMOVE_MS = 50;
export const DISPLAY_MS = 2000;
export const EMPTY_MS = 100;

export function wordAnimationDuration(wordLength: number): number {
	return APPEND_MS * wordLength + DISPLAY_MS + REMOVE_MS * wordLength + EMPTY_MS;
}
