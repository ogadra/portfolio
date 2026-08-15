import type { LanguageShare } from './github';

export interface CommitBar {
	/** Percentage of the block's height, so the CSS reads it as `height:N%`. */
	height: number;
	active: boolean;
}

/** Scaled against the busiest day: a 4% stub for a silent one, a 14% floor for the rest. */
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
