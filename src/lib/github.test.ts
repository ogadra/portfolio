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

const apiFetch = vi.fn((url: string) => {
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
		expect(stats).toMatchObject({ publicRepos: 42, followers: 7 });
		expect(stats?.log[0]).toEqual({ label: 'PUSH ogadra/x', date: '07.05' });
		expect(JSON.parse(kv.store.get('github-stats:v1') ?? '{}')).toMatchObject({ publicRepos: 42 });
	});

	it('falls back to the KV snapshot when the API fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		const kv = memoryKv();
		kv.store.set('github-stats:v1', JSON.stringify({ publicRepos: 41, followers: 6 }));
		const stats = await fetchGithubStats(unconfiguredEnv(kv));
		expect(stats).toMatchObject({ publicRepos: 41 });
	});

	it('returns null when the API fails and no snapshot exists', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		const stats = await fetchGithubStats(unconfiguredEnv(memoryKv()));
		expect(stats).toBeNull();
	});
});
