import type { LanguageShare } from './github';

export interface CommitBar {
	/** Percentage of the block's height, so the CSS reads it as `height:N%`. */
	height: number;
	active: boolean;
}

/**
 * A silent day keeps a 4% stub rather than disappearing, and a day with any
 * commit at all is lifted to 14% so a single commit next to a busy one is still
 * a bar and not a line.
 */
export const commitBars = (daily: readonly number[]): CommitBar[] => {
	const busiest = Math.max(1, ...daily);
	return daily.map((count) => ({
		height: count === 0 ? 4 : Math.max(14, Math.round((count / busiest) * 100)),
		active: count > 0,
	}));
};

/** The account's share of a language, or null when it writes none of it. */
export const languageShare = (languages: readonly LanguageShare[], tech: string): number | null =>
	languages.find((l) => l.name === tech)?.ratio ?? null;
