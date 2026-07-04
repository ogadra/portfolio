export const APPEND_MS = 90;
export const REMOVE_MS = 50;
export const DISPLAY_MS = 2000;
export const EMPTY_MS = 100;

export const wordAnimationDuration = (wordLength: number): number =>
	APPEND_MS * wordLength + DISPLAY_MS + REMOVE_MS * wordLength + EMPTY_MS;
