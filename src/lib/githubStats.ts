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

/** Every event type the public events API delivers, as documented by GitHub. */
const EVENT_LABELS: Record<string, string> = {
	CommitCommentEvent: 'COMMENT',
	CreateEvent: 'CREATE',
	DeleteEvent: 'DELETE',
	ForkEvent: 'FORK',
	GollumEvent: 'WIKI',
	IssueCommentEvent: 'COMMENT',
	IssuesEvent: 'ISSUE',
	MemberEvent: 'MEMBER',
	PublicEvent: 'PUBLIC',
	PullRequestEvent: 'PULL_REQ',
	PullRequestReviewCommentEvent: 'REVIEW',
	PullRequestReviewEvent: 'REVIEW',
	PullRequestReviewThreadEvent: 'REVIEW',
	PushEvent: 'PUSH',
	ReleaseEvent: 'RELEASE',
	SponsorshipEvent: 'SPONSOR',
	WatchEvent: 'STAR',
};

export const eventLabel = (type: string): string => EVENT_LABELS[type] ?? type;
