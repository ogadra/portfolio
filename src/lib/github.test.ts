import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGithubStats, type GithubEnv, type KVStore } from './github';

const memoryKv = (): KVStore & { store: Map<string, string> } => {
	const store = new Map<string, string>();
	return {
		store,
		get: (key) => Promise.resolve(store.get(key) ?? null),
		put: (key, value) => {
			store.set(key, value);
			return Promise.resolve();
		},
	};
};

const unconfiguredEnv = (cache: KVStore): GithubEnv => ({
	GITHUB_APP_ID: '',
	GITHUB_APP_PRIVATE_KEY: '',
	GITHUB_APP_INSTALLATION_ID: '',
	GITHUB_CACHE: cache,
});

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

const DAY_COUNTS: Record<string, number> = {
	'2026-07-05': 3,
	'2026-07-04': 2,
	'2026-07-03': 0,
};

const apiFetch = vi.fn((url: string) => {
	if (url.includes('/search/commits')) {
		const day = decodeURIComponent(url).match(/author-date:(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
		return Promise.resolve(ok({ total_count: DAY_COUNTS[day] ?? 0 }));
	}
	if (url.includes('/repos')) return Promise.resolve(ok([{ language: 'TypeScript' }]));
	if (url.includes('/events/public')) {
		return Promise.resolve(
			ok([{ type: 'PushEvent', created_at: '2026-07-05T00:00:00Z', repo: { name: 'ogadra/x' } }]),
		);
	}
	return Promise.resolve(ok({ public_repos: 42, followers: 7 }));
});

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	apiFetch.mockClear();
});

describe('fetchGithubStats', () => {
	it('returns live stats and stores a snapshot in KV', async () => {
		vi.stubGlobal('fetch', apiFetch);
		const kv = memoryKv();
		const stats = await fetchGithubStats(unconfiguredEnv(kv), new Date('2026-07-05T12:00:00Z'));
		expect(stats).toMatchObject({ publicRepos: 42, followers: 7, recentCommits: 5 });
		expect(stats?.dailyCommits.at(-1)).toBe(3);
		expect(stats?.dailyCommits.at(-2)).toBe(2);
		expect(stats?.log[0]).toEqual({ label: 'PUSH ogadra/x', date: '07.05' });
		expect(JSON.parse(kv.store.get('github-stats:v2') ?? '{}')).toMatchObject({ publicRepos: 42 });
		expect(JSON.parse(kv.store.get('commit-history:v1') ?? '{}')).toEqual({
			'2026-07-05': 3,
			'2026-07-04': 2,
			'2026-07-03': 0,
		});
	});

	it('accumulates commit history across calls beyond the search window', async () => {
		const kv = memoryKv();
		kv.store.set('commit-history:v1', JSON.stringify({ '2026-06-25': 9 }));
		vi.stubGlobal('fetch', apiFetch);
		const stats = await fetchGithubStats(unconfiguredEnv(kv), new Date('2026-07-05T12:00:00Z'));
		// the old day survives even though the search response no longer includes it
		expect(JSON.parse(kv.store.get('commit-history:v1') ?? '{}')['2026-06-25']).toBe(9);
		expect(stats?.dailyCommits).toHaveLength(14);
	});

	it('falls back to the KV snapshot when the API fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		const kv = memoryKv();
		kv.store.set('github-stats:v2', JSON.stringify({ publicRepos: 41, followers: 6 }));
		const stats = await fetchGithubStats(unconfiguredEnv(kv));
		expect(stats).toMatchObject({ publicRepos: 41 });
	});

	it('returns null when the API fails and no snapshot exists', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		const stats = await fetchGithubStats(unconfiguredEnv(memoryKv()));
		expect(stats).toBeNull();
	});
});
