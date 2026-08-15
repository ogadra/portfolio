import { Temporal } from 'temporal-polyfill';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
	commitSeries,
	eventLabel,
	fetchGithubStats,
	languageRatio,
	type GithubEnv,
} from './github';
import type { D1Database, KVNamespace, Snapshot } from './githubStore';

/**
 * The store is mocked so these tests stay about what fetchGithubStats asks of
 * it. What the SQL then does with those arguments is githubStore's own test.
 */
const store = vi.hoisted(() => ({
	readCommitHistory: vi.fn(),
	writeCommitCounts: vi.fn(),
	readSnapshot: vi.fn(),
	writeSnapshot: vi.fn(),
}));

vi.mock('./githubStore', () => store);

const unreachable = (): never => {
	throw new Error('the store is mocked, so no query should reach the bindings');
};

const DB: D1Database = { prepare: unreachable, batch: unreachable };
const GITHUB_CACHE: KVNamespace = { get: unreachable, put: unreachable };

const unconfiguredEnv: GithubEnv = {
	GITHUB_APP_ID: '',
	GITHUB_APP_PRIVATE_KEY: '',
	GITHUB_APP_INSTALLATION_ID: '',
	DB,
	GITHUB_CACHE,
};

const STORED_SNAPSHOT: Snapshot = {
	publicRepos: 41,
	followers: 6,
	languages: [],
	log: [],
};

const at = (iso: string): Temporal.Instant => Temporal.Instant.from(iso);
const NOW = at('2026-07-05T12:00:00Z');

const DAY_COUNTS: Record<string, number> = {
	'2026-07-05': 3,
	'2026-07-04': 2,
	'2026-07-03': 0,
};

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

const apiFetch = vi.fn((url: string, _init?: RequestInit) => {
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
	store.readCommitHistory.mockResolvedValue({});
	store.writeCommitCounts.mockResolvedValue(undefined);
	store.readSnapshot.mockResolvedValue(null);
	store.writeSnapshot.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetAllMocks();
});

describe('fetchGithubStats', () => {
	it('returns live stats and stores a snapshot', async () => {
		vi.stubGlobal('fetch', apiFetch);
		store.readCommitHistory.mockResolvedValue({ '2026-07-05': 3, '2026-07-04': 2 });

		const stats = await fetchGithubStats(unconfiguredEnv, NOW);

		expect(stats).toMatchObject({ publicRepos: 42, followers: 7, recentCommits: 5 });
		expect(stats?.dailyCommits.at(-1)).toBe(3);
		expect(stats?.dailyCommits.at(-2)).toBe(2);
		expect(stats?.log[0]).toEqual({ label: 'PUSH ogadra/x', occurredAt: '2026-07-05T00:00:00Z' });
		expect(store.writeSnapshot).toHaveBeenCalledWith(
			DB,
			GITHUB_CACHE,
			expect.objectContaining({ publicRepos: 42, followers: 7 }),
		);
	});

	it('writes every day the commit search returned', async () => {
		vi.stubGlobal('fetch', apiFetch);

		await fetchGithubStats(unconfiguredEnv, NOW);

		// the search reaches back RECENT_DAYS, so a day is stored before it rolls
		// out of the window and can only be read back from D1
		expect(store.writeCommitCounts).toHaveBeenCalledWith(DB, DAY_COUNTS, expect.any(String));
	});

	it('prunes below the retention cutoff and reads back only the sparkline window', async () => {
		vi.stubGlobal('fetch', apiFetch);

		await fetchGithubStats(unconfiguredEnv, NOW);

		expect(store.writeCommitCounts).toHaveBeenCalledWith(DB, expect.anything(), '2025-05-31');
		expect(store.readCommitHistory).toHaveBeenCalledWith(DB, '2026-06-22');
	});

	it('pads the series to the full window when the store holds fewer days', async () => {
		vi.stubGlobal('fetch', apiFetch);
		store.readCommitHistory.mockResolvedValue({ '2026-07-02': 7 });

		const stats = await fetchGithubStats(unconfiguredEnv, NOW);

		expect(stats?.dailyCommits).toHaveLength(14);
		expect(stats?.dailyCommits.at(-4)).toBe(7);
		expect(stats?.recentCommits).toBe(7);
	});

	it('falls back when the API returns an unexpected shape', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string) =>
				url.endsWith('/users/ogadra')
					? Promise.resolve(ok({ public_repos: 'many', followers: 7 }))
					: apiFetch(url),
			),
		);
		store.readSnapshot.mockResolvedValue(STORED_SNAPSHOT);

		expect(await fetchGithubStats(unconfiguredEnv, NOW)).toMatchObject({ publicRepos: 41 });
	});

	it('falls back to the stored snapshot when the API fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		store.readSnapshot.mockResolvedValue(STORED_SNAPSHOT);

		expect(await fetchGithubStats(unconfiguredEnv, NOW)).toMatchObject({ publicRepos: 41 });
	});

	it('returns null when the API fails and no snapshot exists', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));

		expect(await fetchGithubStats(unconfiguredEnv, NOW)).toBeNull();
	});

	it('falls back to the stored snapshot when a store write fails', async () => {
		vi.stubGlobal('fetch', apiFetch);
		store.writeSnapshot.mockRejectedValue(new Error('D1 unavailable'));
		store.readSnapshot.mockResolvedValue(STORED_SNAPSHOT);

		expect(await fetchGithubStats(unconfiguredEnv, NOW)).toMatchObject({
			publicRepos: 41,
			followers: 6,
		});
	});

	it('returns null when the fallback read fails too', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		store.readSnapshot.mockRejectedValue(new Error('D1 unavailable'));

		expect(await fetchGithubStats(unconfiguredEnv, NOW)).toBeNull();
	});
});

describe('fetchGithubStats app auth', () => {
	const authHeaders = () => [
		...new Set(
			apiFetch.mock.calls.map(
				([, init]) => (init?.headers as Record<string, string> | undefined)?.authorization,
			),
		),
	];

	it('sends the minted installation token on every API request', async () => {
		const { privateKey } = (await crypto.subtle.generateKey(
			{
				name: 'RSASSA-PKCS1-v1_5',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256',
			},
			true,
			['sign', 'verify'],
		)) as CryptoKeyPair;
		const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
		const configuredEnv: GithubEnv = {
			...unconfiguredEnv,
			GITHUB_APP_ID: '12345',
			GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`,
			GITHUB_APP_INSTALLATION_ID: '67890',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string, init?: RequestInit) =>
				url.endsWith('/access_tokens')
					? Promise.resolve(ok({ token: 'minted-token' }))
					: apiFetch(url, init),
			),
		);

		await fetchGithubStats(configuredEnv, NOW);

		expect(authHeaders()).toEqual(['Bearer minted-token']);
	});

	it('sends no authorization header when app auth is not configured', async () => {
		vi.stubGlobal('fetch', apiFetch);

		await fetchGithubStats(unconfiguredEnv, NOW);

		expect(authHeaders()).toEqual([undefined]);
	});
});

describe('commitSeries', () => {
	it('builds an oldest-to-newest series with zeros for missing days', () => {
		const history = { '2026-07-07': 4, '2026-07-05': 6 };
		expect(commitSeries(history, at('2026-07-07T12:00:00Z'), 4)).toEqual([0, 6, 0, 4]);
	});
});

describe('languageRatio', () => {
	it('returns the top languages with rounded percentages', () => {
		const langs = ['TypeScript', 'TypeScript', 'Go', 'TypeScript', 'HCL', null, 'Go'];
		expect(languageRatio(langs)).toEqual([
			{ name: 'TypeScript', ratio: 50 },
			{ name: 'Go', ratio: 33 },
			{ name: 'HCL', ratio: 17 },
		]);
	});

	it('keeps only the top languages the caller asked for', () => {
		const langs = ['Go', 'Go', 'Go', 'TypeScript', 'TypeScript', 'HCL', 'Nix'];
		expect(languageRatio(langs, 2)).toEqual([
			{ name: 'Go', ratio: 43 },
			{ name: 'TypeScript', ratio: 29 },
		]);
		// ratios stay shares of the whole set, so a truncated list sums below 100
		expect(languageRatio(langs, 8).map((l) => l.name)).toEqual(['Go', 'TypeScript', 'HCL', 'Nix']);
	});

	it('returns an empty list when no language is known', () => {
		expect(languageRatio([null, null])).toEqual([]);
	});
});

describe('eventLabel', () => {
	it('maps known GitHub event types to short labels', () => {
		expect(eventLabel('PushEvent')).toBe('PUSH');
		expect(eventLabel('PullRequestEvent')).toBe('PULL_REQ');
	});

	it('passes an unknown type through untouched', () => {
		expect(eventLabel('SomethingNewEvent')).toBe('SomethingNewEvent');
	});
});
