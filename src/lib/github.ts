import { getInstallationToken, type GithubAppEnv } from './githubApp';
import { bucketByDay, eventLabel, languageRatio, type LanguageShare } from './githubStats';

const API = 'https://api.github.com';
const USER = 'ogadra';
const FETCH_TIMEOUT_MS = 2500;
const ACTIVITY_DAYS = 14;
const LOG_LINES = 12;
const KV_KEY = 'github-stats:v1';

export interface GithubStats {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	dailyEvents: number[];
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
		const [user, repos, events] = await Promise.all([
			request<GithubUser>(`/users/${USER}`, token),
			request<GithubRepo[]>(`/users/${USER}/repos?per_page=100&sort=pushed`, token),
			request<GithubEvent[]>(`/users/${USER}/events/public?per_page=100`, token),
		]);
		const data: GithubStats = {
			publicRepos: user.public_repos,
			followers: user.followers,
			languages: languageRatio(
				repos.map((r) => r.language),
				8,
			),
			dailyEvents: bucketByDay(
				events.map((e) => e.created_at),
				now,
				ACTIVITY_DAYS,
			),
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
