import { Temporal } from 'temporal-polyfill';
import { commitSeries, utcDay, type CommitHistory } from './commitHistory';
import { getInstallationToken, type GithubAppEnv } from './githubApp';
import { eventLabel, languageRatio, type LanguageShare } from './githubStats';
import {
	cloudflareStore,
	type D1Database,
	type GithubStore,
	type KVNamespace,
	type Snapshot,
} from './githubStore';

const API = 'https://api.github.com';
const USER = 'ogadra';
const FETCH_TIMEOUT_MS = 2500;
/** Days of commit history the sparkline shows. */
export const ACTIVITY_DAYS = 14;
const LOG_LINES = 12;
const RECENT_DAYS = 3;
const RETENTION_DAYS = 400;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

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
	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		'user-agent': 'ogadra.com',
	};
	if (token) headers.authorization = `Bearer ${token}`;
	const res = await fetch(`${API}${path}`, {
		headers,
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
		8,
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

const readActivity = async (store: GithubStore, now: Temporal.Instant): Promise<number[]> =>
	commitSeries(await store.readCommitHistory(activityWindowStart(now)), now, ACTIVITY_DAYS);

const readFallbackStats = async (
	store: GithubStore,
	now: Temporal.Instant,
): Promise<GithubStats | null> => {
	const snapshot = await store.readSnapshot();
	if (!snapshot) return null;
	return toStats(snapshot, await readActivity(store, now));
};

/**
 * Fetches live GitHub stats on every call, authenticated as the GitHub App
 * installation when configured. The stored snapshot is read only when the live
 * fetch fails (rate limits, timeouts, store writes).
 */
export const fetchGithubStats = async (
	env: GithubEnv,
	now = Temporal.Now.instant(),
	store: GithubStore = cloudflareStore(env.DB, env.GITHUB_CACHE),
): Promise<GithubStats | null> => {
	try {
		const token = await getInstallationToken(env, now);
		const [user, repos, events, freshCounts] = await Promise.all([
			request(`/users/${USER}`, token).then(parseUser),
			request(`/users/${USER}/repos?per_page=100&sort=pushed`, token).then(parseRepos),
			request(`/users/${USER}/events/public?per_page=100`, token).then(parseEvents),
			fetchRecentCommitCounts(token, now),
		]);
		await store.writeCommitCounts(freshCounts, retentionCutoff(now));
		const dailyCommits = await readActivity(store, now);
		const snapshot = buildSnapshot(user, repos, events);
		await store.writeSnapshot(snapshot);
		return toStats(snapshot, dailyCommits);
	} catch (error) {
		console.error('[github] fetch failed:', error);
		try {
			return await readFallbackStats(store, now);
		} catch (fallbackError) {
			console.error('[github] fallback read failed:', fallbackError);
			return null;
		}
	}
};
