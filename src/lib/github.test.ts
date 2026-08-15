import { Temporal } from 'temporal-polyfill';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
	commitSeries,
	eventLabel,
	fetchGithubStats,
	languageRatio,
	type GithubEnv,
} from './github';
import type { CommitHistory, GithubStore, Snapshot } from './githubStore';

interface MemoryStore extends GithubStore {
	history: CommitHistory;
	snapshot: Snapshot | null;
}

const memoryStore = (): MemoryStore => {
	const store: MemoryStore = {
		history: {},
		snapshot: null,
		readCommitHistory: (sinceDay) =>
			Promise.resolve(
				Object.fromEntries(Object.entries(store.history).filter(([day]) => day >= sinceDay)),
			),
		writeCommitCounts: (counts, cutoff) => {
			for (const [day, count] of Object.entries(counts)) {
				store.history[day] = Math.max(store.history[day] ?? 0, count);
			}
			for (const day of Object.keys(store.history)) {
				if (day < cutoff) delete store.history[day];
			}
			return Promise.resolve();
		},
		readSnapshot: () => Promise.resolve(store.snapshot ? { ...store.snapshot } : null),
		writeSnapshot: (snapshot) => {
			store.snapshot = snapshot;
			return Promise.resolve();
		},
	};
	return store;
};

const unconfiguredEnv: GithubEnv = {
	GITHUB_APP_ID: '',
	GITHUB_APP_PRIVATE_KEY: '',
	GITHUB_APP_INSTALLATION_ID: '',
	DB: { prepare: () => ({}) as never, batch: () => Promise.resolve([]) },
	GITHUB_CACHE: { get: () => Promise.resolve(null), put: () => Promise.resolve() },
};

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
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	apiFetch.mockClear();
});

describe('fetchGithubStats', () => {
	it('returns live stats and stores a snapshot', async () => {
		vi.stubGlobal('fetch', apiFetch);
		const store = memoryStore();
		const stats = await fetchGithubStats(
			unconfiguredEnv,
			Temporal.Instant.from('2026-07-05T12:00:00Z'),
			store,
		);
		expect(stats).toMatchObject({ publicRepos: 42, followers: 7, recentCommits: 5 });
		expect(stats?.dailyCommits.at(-1)).toBe(3);
		expect(stats?.dailyCommits.at(-2)).toBe(2);
		expect(stats?.log[0]).toEqual({ label: 'PUSH ogadra/x', occurredAt: '2026-07-05T00:00:00Z' });
		expect(store.snapshot).toMatchObject({ publicRepos: 42 });
		expect(store.history).toEqual({
			'2026-07-05': 3,
			'2026-07-04': 2,
			'2026-07-03': 0,
		});
	});

	it('accumulates commit history across calls beyond the search window', async () => {
		vi.stubGlobal('fetch', apiFetch);
		const store = memoryStore();

		await fetchGithubStats(unconfiguredEnv, Temporal.Instant.from('2026-07-05T12:00:00Z'), store);
		// three days on, the 07-05 count has rolled out of the commit-search window
		const stats = await fetchGithubStats(
			unconfiguredEnv,
			Temporal.Instant.from('2026-07-08T12:00:00Z'),
			store,
		);

		expect(store.history['2026-07-05']).toBe(3);
		expect(stats?.dailyCommits).toHaveLength(14);
		expect(stats?.dailyCommits.at(-4)).toBe(3);
		expect(stats?.recentCommits).toBe(5);
	});

	it('drops days that fall below the retention cutoff', async () => {
		vi.stubGlobal('fetch', apiFetch);
		const store = memoryStore();
		store.history['2024-01-01'] = 9;
		store.history['2026-06-25'] = 4;

		await fetchGithubStats(unconfiguredEnv, Temporal.Instant.from('2026-07-05T12:00:00Z'), store);

		expect(store.history['2024-01-01']).toBeUndefined();
		expect(store.history['2026-06-25']).toBe(4);
	});

	it('falls back when the API returns an unexpected shape', async () => {
		const badUser = vi.fn((url: string) =>
			url.endsWith('/users/ogadra')
				? Promise.resolve(ok({ public_repos: 'many', followers: 7 }))
				: apiFetch(url),
		);
		vi.stubGlobal('fetch', badUser);
		const store = memoryStore();
		store.snapshot = { publicRepos: 41, followers: 6, languages: [], log: [] };
		const stats = await fetchGithubStats(unconfiguredEnv, undefined, store);
		expect(stats).toMatchObject({ publicRepos: 41 });
	});

	it('falls back to the stored snapshot when the API fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		const store = memoryStore();
		store.snapshot = { publicRepos: 41, followers: 6, languages: [], log: [] };
		const stats = await fetchGithubStats(unconfiguredEnv, undefined, store);
		expect(stats).toMatchObject({ publicRepos: 41 });
	});

	it('returns null when the API fails and no snapshot exists', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		const stats = await fetchGithubStats(unconfiguredEnv, undefined, memoryStore());
		expect(stats).toBeNull();
	});

	it('falls back to the stored snapshot when a store write fails', async () => {
		vi.stubGlobal('fetch', apiFetch);
		const store = memoryStore();
		store.snapshot = { publicRepos: 41, followers: 6, languages: [], log: [] };
		store.writeSnapshot = () => Promise.reject(new Error('D1 unavailable'));
		const stats = await fetchGithubStats(
			unconfiguredEnv,
			Temporal.Instant.from('2026-07-05T12:00:00Z'),
			store,
		);
		expect(stats).toMatchObject({ publicRepos: 41, followers: 6 });
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

		await fetchGithubStats(
			configuredEnv,
			Temporal.Instant.from('2026-07-05T12:00:00Z'),
			memoryStore(),
		);

		expect(authHeaders()).toEqual(['Bearer minted-token']);
	});

	it('sends no authorization header when app auth is not configured', async () => {
		vi.stubGlobal('fetch', apiFetch);
		await fetchGithubStats(
			unconfiguredEnv,
			Temporal.Instant.from('2026-07-05T12:00:00Z'),
			memoryStore(),
		);
		expect(authHeaders()).toEqual([undefined]);
	});
});

describe('commitSeries', () => {
	it('builds an oldest-to-newest series with zeros for missing days', () => {
		const now = Temporal.Instant.from('2026-07-07T12:00:00Z');
		const history = { '2026-07-07': 4, '2026-07-05': 6 };
		expect(commitSeries(history, now, 4)).toEqual([0, 6, 0, 4]);
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
