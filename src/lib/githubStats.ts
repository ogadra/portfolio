export interface LanguageShare {
	name: string;
	ratio: number;
}

export const languageRatio = (languages: readonly (string | null)[], top = 3): LanguageShare[] => {
	const counts = new Map<string, number>();
	for (const lang of languages) {
		if (!lang) continue;
		counts.set(lang, (counts.get(lang) ?? 0) + 1);
	}
	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	if (total === 0) return [];
	return [...counts.entries()]
		.toSorted((a, b) => b[1] - a[1])
		.slice(0, top)
		.map(([name, count]) => ({ name, ratio: Math.round((count / total) * 100) }));
};

const EVENT_LABELS: Record<string, string> = {
	PushEvent: 'PUSH',
	CreateEvent: 'CREATE',
	DeleteEvent: 'DELETE',
	PullRequestEvent: 'PULL_REQ',
	PullRequestReviewEvent: 'REVIEW',
	IssuesEvent: 'ISSUE',
	IssueCommentEvent: 'COMMENT',
	WatchEvent: 'STAR',
	ForkEvent: 'FORK',
	ReleaseEvent: 'RELEASE',
};

export const eventLabel = (type: string): string =>
	EVENT_LABELS[type] ?? type.replace(/Event$/, '').toUpperCase();
