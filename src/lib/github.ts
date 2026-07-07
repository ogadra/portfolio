import {
	commitSeries,
	commitsByDay,
	mergeCommitHistory,
	type CommitHistory,
} from './commitHistory';
import { getInstallationToken, type GithubAppEnv } from './githubApp';
import { eventLabel, languageRatio, type LanguageShare } from './githubStats';

const API = 'https://api.github.com';
const USER = 'ogadra';
const FETCH_TIMEOUT_MS = 2500;
const ACTIVITY_DAYS = 14;
const LOG_LINES = 12;
const KV_KEY = 'github-stats:v2';
const HISTORY_KEY = 'commit-history:v1';

export interface GithubStats {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	recentCommits: number;
	dailyCommits: number[];
	log: { label: string; date: string }[];
}

/** Minimal structural view of a Workers KV namespace binding. */
export interface KVStore {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
}

export type GithubEnv = GithubAppEnv;

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

interface CommitSearch {
	total_count: number;
	items: { commit: { author: { date: string } } }[];
}

const commitSearchPath = (now: Date): string => {
	const since = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000).toISOString().slice(0, 10);
	const q = encodeURIComponent(`author:${USER} author-date:>=${since}`);
	return `/search/commits?q=${q}&per_page=100&sort=author-date&order=desc`;
};

const request = async <T>(path: string, token: string | undefined): Promise<T> => {
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
	return res.json() as Promise<T>;
};

const readHistory = async (env: GithubEnv): Promise<CommitHistory> => {
	try {
		const raw = await env.GITHUB_CACHE.get(HISTORY_KEY);
		return raw ? (JSON.parse(raw) as CommitHistory) : {};
	} catch (error) {
		console.error('[github] history read failed:', error);
		return {};
	}
};

/**
 * The commits search only reaches back ~100 commits, so for an active account
 * it covers just a few days. Persisting each observed day in KV lets the
 * history accumulate past that window. Overlapping days keep their larger
 * count, and the write is skipped when nothing changed.
 */
const persistCommitHistory = async (
	env: GithubEnv,
	items: CommitSearch['items'],
	now: Date,
): Promise<CommitHistory> => {
	const stored = await readHistory(env);
	const fresh = commitsByDay(items.map((c) => c.commit.author.date));
	const merged = mergeCommitHistory(stored, fresh, now);
	if (JSON.stringify(merged) !== JSON.stringify(stored)) {
		try {
			await env.GITHUB_CACHE.put(HISTORY_KEY, JSON.stringify(merged));
		} catch (error) {
			console.error('[github] history write failed:', error);
		}
	}
	return merged;
};

/**
 * Fetches live GitHub stats on every call, authenticated as the GitHub App
 * installation when configured. The KV snapshot is only a fallback for API
 * failures (rate limits, timeouts), never a primary source.
 */
export const fetchGithubStats = async (
	env: GithubEnv,
	now = new Date(),
): Promise<GithubStats | null> => {
	try {
		const token = await getInstallationToken(env, now);
		const [user, repos, events, commits] = await Promise.all([
			request<GithubUser>(`/users/${USER}`, token),
			request<GithubRepo[]>(`/users/${USER}/repos?per_page=100&sort=pushed`, token),
			request<GithubEvent[]>(`/users/${USER}/events/public?per_page=100`, token),
			request<CommitSearch>(commitSearchPath(now), token),
		]);
		const history = await persistCommitHistory(env, commits.items, now);
		const dailyCommits = commitSeries(history, now, ACTIVITY_DAYS);
		const data: GithubStats = {
			publicRepos: user.public_repos,
			followers: user.followers,
			languages: languageRatio(
				repos.map((r) => r.language),
				8,
			),
			recentCommits: dailyCommits.reduce((sum, n) => sum + n, 0),
			dailyCommits,
			log: events.slice(0, LOG_LINES).map((e) => ({
				label: `${eventLabel(e.type)} ${e.repo.name}`,
				date: e.created_at.slice(5, 10).replace('-', '.'),
			})),
		};
		try {
			await env.GITHUB_CACHE.put(KV_KEY, JSON.stringify(data));
		} catch (error) {
			console.error('[github] cache write failed:', error);
		}
		return data;
	} catch (error) {
		console.error('[github] fetch failed:', error);
		try {
			const snapshot = await env.GITHUB_CACHE.get(KV_KEY);
			if (snapshot) return JSON.parse(snapshot) as GithubStats;
		} catch (cacheError) {
			console.error('[github] cache read failed:', cacheError);
		}
		return null;
	}
};
