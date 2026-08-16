import { Temporal } from 'temporal-polyfill';
import { FETCH_TIMEOUT_MS, GITHUB_API, githubHeaders, isRecord } from './githubApi';
import { getInstallationToken, type GithubAppEnv } from './githubApp';
import {
	readContributionHistory,
	readSnapshot,
	writeContributionCounts,
	writeSnapshot,
	type ContributionHistory,
	type D1Database,
	type KVNamespace,
	type LanguageShare,
	type Snapshot,
} from './githubStore';

// languageRatio returns it and GithubStats carries it, so a caller can name it without the store.
export type { LanguageShare };

const USER = 'ogadra';
/** Days of contribution history the sparkline shows. */
export const ACTIVITY_DAYS = 14;
const LOG_LINES = 12;
const RETENTION_DAYS = 400;
const TOP_LANGUAGES = 8;

export interface GithubStats {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	recentContributions: number;
	dailyContributions: number[];
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

/** The UTC day an instant falls in, which is how the calendar keys its days and how PlainDate prints. */
const utcDay = (now: Temporal.Instant): Temporal.PlainDate =>
	now.toZonedDateTimeISO('UTC').toPlainDate();

export const contributionSeries = (
	history: ContributionHistory,
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

/** Walks a nested response, answering undefined the moment the shape stops matching. */
const nested = (body: unknown, path: readonly string[]): unknown =>
	path.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), body);

const parseContributionCalendar = (body: unknown): ContributionHistory => {
	const weeks = nested(body, [
		'data',
		'user',
		'contributionsCollection',
		'contributionCalendar',
		'weeks',
	]);
	if (!Array.isArray(weeks)) return unexpected('contribution calendar');
	const history: ContributionHistory = {};
	for (const week of weeks) {
		const days = nested(week, ['contributionDays']);
		if (!Array.isArray(days)) return unexpected('contribution week');
		for (const day of days) {
			if (!isRecord(day)) return unexpected('contribution day');
			const { date, contributionCount: count } = day;
			if (typeof date !== 'string') return unexpected('contribution day');
			if (typeof count !== 'number') return unexpected('contribution day');
			history[date] = count;
		}
	}
	return history;
};

const request = async (path: string, token: string | undefined): Promise<unknown> => {
	const res = await fetch(`${GITHUB_API}${path}`, {
		headers: githubHeaders(token),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);
	return res.json();
};

// The calendar is GraphQL-only; REST has no endpoint for it, and GraphQL refuses an anonymous call.
const CALENDAR_QUERY = `query($login: String!) {
	user(login: $login) {
		contributionsCollection {
			contributionCalendar {
				weeks { contributionDays { date contributionCount } }
			}
		}
	}
}`;

const fetchContributionHistory = async (
	token: string | undefined,
): Promise<ContributionHistory> => {
	const res = await fetch(`${GITHUB_API}/graphql`, {
		method: 'POST',
		headers: { ...githubHeaders(token), 'content-type': 'application/json' },
		body: JSON.stringify({ query: CALENDAR_QUERY, variables: { login: USER } }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`GitHub GraphQL responded with ${res.status}`);
	return parseContributionCalendar(await res.json());
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

const toStats = (snapshot: Snapshot, dailyContributions: number[]): GithubStats => ({
	publicRepos: snapshot.publicRepos,
	followers: snapshot.followers,
	languages: snapshot.languages,
	recentContributions: dailyContributions.reduce((sum, n) => sum + n, 0),
	dailyContributions,
	log: snapshot.log,
});

/** Hands a promise to the runtime, which otherwise cancels anything still pending. */
export type WaitUntil = (promise: Promise<unknown>) => void;

/** Records the refresh. Failing to store it costs the next call, not this one. */
const persist = async (
	env: GithubEnv,
	snapshot: Snapshot,
	history: ContributionHistory,
	cutoffDay: string,
): Promise<void> => {
	const writes = await Promise.allSettled([
		writeContributionCounts(env.DB, history, cutoffDay),
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
	const stored = await readContributionHistory(env.DB, activityWindowStart(now));
	return toStats(snapshot, contributionSeries(stored, now, ACTIVITY_DAYS));
};

/**
 * Fetches live GitHub stats on every call, authenticated as the GitHub App installation. The
 * calendar carries a full year, so the answer needs nothing from D1 and never waits on the write
 * that records it. The store is read back only when the live fetch fails (rate limits, timeouts).
 */
export const fetchGithubStats = async (
	env: GithubEnv,
	waitUntil: WaitUntil,
	now = Temporal.Now.instant(),
): Promise<GithubStats | null> => {
	try {
		const token = await getInstallationToken(env, now);
		const [user, repos, events, history] = await Promise.all([
			request(`/users/${USER}`, token).then(parseUser),
			request(`/users/${USER}/repos?per_page=100&sort=pushed`, token).then(parseRepos),
			request(`/users/${USER}/events/public?per_page=100`, token).then(parseEvents),
			fetchContributionHistory(token),
		]);
		const snapshot = buildSnapshot(user, repos, events);
		waitUntil(persist(env, snapshot, history, retentionCutoff(now)));
		return toStats(snapshot, contributionSeries(history, now, ACTIVITY_DAYS));
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
