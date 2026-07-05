import { bucketByDay, eventLabel, languageRatio, type LanguageShare } from './githubStats';

const API = 'https://api.github.com';
const USER = 'ogadra';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;
const ACTIVITY_DAYS = 14;
const LOG_LINES = 12;

export interface GithubStats {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	dailyEvents: number[];
	log: { label: string; date: string }[];
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
	created_at: string | null;
	repo?: { name?: string };
}

let cache: { at: number; data: GithubStats } | null = null;

const request = async <T>(path: string): Promise<T> => {
	const res = await fetch(`${API}${path}`, {
		headers: {
			accept: 'application/vnd.github+json',
			'user-agent': 'ogadra.com',
		},
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);
	return res.json() as Promise<T>;
};

export const fetchGithubStats = async (now = new Date()): Promise<GithubStats | null> => {
	if (cache && now.getTime() - cache.at < CACHE_TTL_MS) return cache.data;
	try {
		const [user, repos, events] = await Promise.all([
			request<GithubUser>(`/users/${USER}`),
			request<GithubRepo[]>(`/users/${USER}/repos?per_page=100&sort=pushed`),
			request<GithubEvent[]>(`/users/${USER}/events/public?per_page=100`),
		]);
		const data: GithubStats = {
			publicRepos: user.public_repos,
			followers: user.followers,
			languages: languageRatio(
				repos.map((r) => r.language),
				8,
			),
			dailyEvents: bucketByDay(
				events.flatMap((e) => (e.created_at ? [e.created_at] : [])),
				now,
				ACTIVITY_DAYS,
			),
			log: events.slice(0, LOG_LINES).map((e) => ({
				label: `${eventLabel(e.type)} ${e.repo?.name ?? ''}`.trim(),
				date: (e.created_at ?? '').slice(5, 10).replace('-', '.'),
			})),
		};
		cache = { at: now.getTime(), data };
		return data;
	} catch (error) {
		console.error('[github] fetch failed:', error);
		return null;
	}
};
