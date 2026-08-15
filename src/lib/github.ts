import { Temporal } from 'temporal-polyfill';
import { FETCH_TIMEOUT_MS, GITHUB_API, githubHeaders, isRecord } from './githubApi';
import { getInstallationToken, type GithubAppEnv } from './githubApp';
import {
	readCommitHistory,
	readSnapshot,
	writeCommitCounts,
	writeSnapshot,
	type CommitHistory,
	type D1Database,
	type KVNamespace,
	type LanguageShare,
	type Snapshot,
} from './githubStore';

const USER = 'ogadra';
/** Days of commit history the sparkline shows. */
export const ACTIVITY_DAYS = 14;
const LOG_LINES = 12;
const RECENT_DAYS = 3;
const RETENTION_DAYS = 400;
const TOP_LANGUAGES = 8;

export interface GithubStats {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	recentCommits: number;
	dailyCommits: number[];
	log: { label: string; occurredAt: string }[];
}

export interface GithubEnv extends GithubAppEnv {
	DB: D1Database;
	GITHUB_CACHE: KVNamespace;
}

interface GithubUser {
	public_repos: number;
	followers: number;
}

interface GithubRepo {
	language: string | null;
}

interface GithubEvent {
	type: string;
	created_at: string;
	repo: { name: string };
}

/**
 * The UTC day an instant falls in. Commit counts are keyed by the day GitHub's
 * commit search reports them under, which is UTC regardless of where the run
 * happens, and `PlainDate` stringifies to exactly that `YYYY-MM-DD` key.
 */
const utcDay = (now: Temporal.Instant): Temporal.PlainDate =>
	now.toZonedDateTimeISO('UTC').toPlainDate();

export const commitSeries = (
	history: CommitHistory,
	now: Temporal.Instant,
	days: number,
): number[] => {
	const today = utcDay(now);
	return Array.from(
		{ length: days },
		(_, i) => history[today.subtract({ days: days - 1 - i }).toString()] ?? 0,
	);
};

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

const unexpected = (shape: string): never => {
	throw new Error(`GitHub API returned an unexpected ${shape}`);
};

const parseUser = (body: unknown): GithubUser => {
	if (!isRecord(body)) return unexpected('user');
	const { public_repos: publicRepos, followers } = body;
	if (typeof publicRepos !== 'number') return unexpected('user');
	if (typeof followers !== 'number') return unexpected('user');
	return { public_repos: publicRepos, followers };
};

const parseRepo = (body: unknown): GithubRepo => {
	if (!isRecord(body)) return unexpected('repo');
	const { language } = body;
	if (typeof language !== 'string' && language !== null) return unexpected('repo');
	return { language };
};

const parseRepos = (body: unknown): GithubRepo[] => {
	if (!Array.isArray(body)) return unexpected('repo list');
	return body.map(parseRepo);
};

const parseEvent = (body: unknown): GithubEvent => {
	if (!isRecord(body)) return unexpected('event');
	const { type, created_at: createdAt, repo } = body;
	if (typeof type !== 'string') return unexpected('event');
	if (typeof createdAt !== 'string') return unexpected('event');
	if (!isRecord(repo)) return unexpected('event');
	const { name } = repo;
	if (typeof name !== 'string') return unexpected('event');
	return { type, created_at: createdAt, repo: { name } };
};

const parseEvents = (body: unknown): GithubEvent[] => {
	if (!Array.isArray(body)) return unexpected('event list');
	return body.map(parseEvent);
};

const parseCommitCount = (body: unknown): number => {
	if (!isRecord(body)) return unexpected('commit count');
	const { total_count: totalCount } = body;
	if (typeof totalCount !== 'number') return unexpected('commit count');
	return totalCount;
};

const dayCountPath = (day: string): string =>
	`/search/commits?q=${encodeURIComponent(`author:${USER} author-date:${day}`)}&per_page=1`;

const request = async (path: string, token: string | undefined): Promise<unknown> => {
	const res = await fetch(`${GITHUB_API}${path}`, {
		headers: githubHeaders(token),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);
	return res.json();
};

const fetchRecentCommitCounts = async (
	token: string | undefined,
	now: Temporal.Instant,
): Promise<CommitHistory> => {
	const today = utcDay(now);
	const days = Array.from({ length: RECENT_DAYS }, (_, i) =>
		today.subtract({ days: i }).toString(),
	);
	const bodies = await Promise.all(days.map((day) => request(dayCountPath(day), token)));
	return Object.fromEntries(days.map((day, i) => [day, parseCommitCount(bodies[i])]));
};

/** Oldest day the sparkline can show, so the store never reads past it. */
const activityWindowStart = (now: Temporal.Instant): string =>
	utcDay(now)
		.subtract({ days: ACTIVITY_DAYS - 1 })
		.toString();

const retentionCutoff = (now: Temporal.Instant): string =>
	utcDay(now).subtract({ days: RETENTION_DAYS }).toString();

const buildSnapshot = (user: GithubUser, repos: GithubRepo[], events: GithubEvent[]): Snapshot => ({
	publicRepos: user.public_repos,
	followers: user.followers,
	languages: languageRatio(
		repos.map((r) => r.language),
		TOP_LANGUAGES,
	),
	log: events.slice(0, LOG_LINES).map((e) => ({
		label: `${eventLabel(e.type)} ${e.repo.name}`,
		occurredAt: e.created_at,
	})),
});

const toStats = (snapshot: Snapshot, dailyCommits: number[]): GithubStats => ({
	publicRepos: snapshot.publicRepos,
	followers: snapshot.followers,
	languages: snapshot.languages,
	recentCommits: dailyCommits.reduce((sum, n) => sum + n, 0),
	dailyCommits,
	log: snapshot.log,
});

/**
 * Merges the days the commit search just reported into the stored ones. Taking
 * the larger count matches what the upsert does in SQL: a day the search no
 * longer reaches comes back as 0, and that must not erase what is on record.
 */
const mergeCounts = (stored: CommitHistory, fresh: CommitHistory): CommitHistory => ({
	...stored,
	...Object.fromEntries(
		Object.entries(fresh).map(([day, count]) => [day, Math.max(stored[day] ?? 0, count)]),
	),
});

/**
 * Hands a promise to the runtime so it survives past the response. Cloudflare
 * cancels anything still pending otherwise.
 */
export type WaitUntil = (promise: Promise<unknown>) => void;

/** Records the refresh. Failing to store it costs the next call, not this one. */
const persist = async (
	env: GithubEnv,
	snapshot: Snapshot,
	freshCounts: CommitHistory,
	cutoffDay: string,
): Promise<void> => {
	const writes = await Promise.allSettled([
		writeCommitCounts(env.DB, freshCounts, cutoffDay),
		writeSnapshot(env.DB, env.GITHUB_CACHE, snapshot),
	]);
	for (const write of writes) {
		if (write.status === 'rejected') console.error('[github] store write failed:', write.reason);
	}
};

const readFallbackStats = async (
	env: GithubEnv,
	now: Temporal.Instant,
): Promise<GithubStats | null> => {
	const snapshot = await readSnapshot(env.DB, env.GITHUB_CACHE);
	if (!snapshot) return null;
	const stored = await readCommitHistory(env.DB, activityWindowStart(now));
	return toStats(snapshot, commitSeries(stored, now, ACTIVITY_DAYS));
};

/**
 * Fetches live GitHub stats on every call, authenticated as the GitHub App
 * installation when configured. The answer comes from what the API returned
 * plus the history already on record, so the response never waits on a write;
 * the refresh is stored in the background. The snapshot is read back only when
 * the live fetch fails (rate limits, timeouts).
 */
export const fetchGithubStats = async (
	env: GithubEnv,
	waitUntil: WaitUntil,
	now = Temporal.Now.instant(),
): Promise<GithubStats | null> => {
	try {
		const token = await getInstallationToken(env, now);
		const [user, repos, events, freshCounts, storedHistory] = await Promise.all([
			request(`/users/${USER}`, token).then(parseUser),
			request(`/users/${USER}/repos?per_page=100&sort=pushed`, token).then(parseRepos),
			request(`/users/${USER}/events/public?per_page=100`, token).then(parseEvents),
			fetchRecentCommitCounts(token, now),
			readCommitHistory(env.DB, activityWindowStart(now)),
		]);
		const snapshot = buildSnapshot(user, repos, events);
		waitUntil(persist(env, snapshot, freshCounts, retentionCutoff(now)));
		const history = mergeCounts(storedHistory, freshCounts);
		return toStats(snapshot, commitSeries(history, now, ACTIVITY_DAYS));
	} catch (error) {
		console.error('[github] fetch failed:', error);
		try {
			return await readFallbackStats(env, now);
		} catch (fallbackError) {
			console.error('[github] fallback read failed:', fallbackError);
			return null;
		}
	}
};
