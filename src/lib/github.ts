import { commitSeries, DAY_MS, dayKey, utcMidnight, type CommitHistory } from './commitHistory';
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
	log: { label: string; date: string }[];
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

const parseUser = (body: unknown): GithubUser =>
	isRecord(body) && typeof body.public_repos === 'number' && typeof body.followers === 'number'
		? { public_repos: body.public_repos, followers: body.followers }
		: unexpected('user');

const parseRepos = (body: unknown): GithubRepo[] =>
	Array.isArray(body)
		? body.map((repo) =>
				isRecord(repo) && (typeof repo.language === 'string' || repo.language === null)
					? { language: repo.language }
					: unexpected('repo'),
			)
		: unexpected('repo list');

const parseEvents = (body: unknown): GithubEvent[] =>
	Array.isArray(body)
		? body.map((event) =>
				isRecord(event) &&
				typeof event.type === 'string' &&
				typeof event.created_at === 'string' &&
				isRecord(event.repo) &&
				typeof event.repo.name === 'string'
					? { type: event.type, created_at: event.created_at, repo: { name: event.repo.name } }
					: unexpected('event'),
			)
		: unexpected('event list');

const parseCommitCount = (body: unknown): number =>
	isRecord(body) && typeof body.total_count === 'number'
		? body.total_count
		: unexpected('commit count');

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
	now: Date,
): Promise<CommitHistory> => {
	const today = utcMidnight(now);
	const days = Array.from({ length: RECENT_DAYS }, (_, i) => dayKey(today - i * DAY_MS));
	const bodies = await Promise.all(days.map((day) => request(dayCountPath(day), token)));
	return Object.fromEntries(days.map((day, i) => [day, parseCommitCount(bodies[i])]));
};

/** Oldest day the sparkline can show, so the store never reads past it. */
const activityWindowStart = (now: Date): string =>
	dayKey(utcMidnight(now) - (ACTIVITY_DAYS - 1) * DAY_MS);

const retentionCutoff = (now: Date): string => dayKey(utcMidnight(now) - RETENTION_DAYS * DAY_MS);

const buildSnapshot = (user: GithubUser, repos: GithubRepo[], events: GithubEvent[]): Snapshot => ({
	publicRepos: user.public_repos,
	followers: user.followers,
	languages: languageRatio(
		repos.map((r) => r.language),
		8,
	),
	log: events.slice(0, LOG_LINES).map((e) => ({
		label: `${eventLabel(e.type)} ${e.repo.name}`,
		date: e.created_at.slice(5, 10).replace('-', '.'),
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

const readActivity = async (store: GithubStore, now: Date): Promise<number[]> =>
	commitSeries(await store.readCommitHistory(activityWindowStart(now)), now, ACTIVITY_DAYS);

const readFallbackStats = async (store: GithubStore, now: Date): Promise<GithubStats | null> => {
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
	now = new Date(),
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
