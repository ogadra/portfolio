import { Temporal } from 'temporal-polyfill';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
	contributionSeries,
	eventLabel,
	fetchGithubStats,
	languageRatio,
	type GithubEnv,
} from './github';
import { configuredAppEnv } from './githubApp.fixture';
import type { D1Database, KVNamespace, Snapshot } from './githubStore';

/**
 * The store is mocked so these tests stay about what fetchGithubStats asks of
 * it. What the SQL then does with those arguments is githubStore's own test.
 */
const store = vi.hoisted(() => ({
	readContributionHistory: vi.fn(),
	writeContributionCounts: vi.fn(),
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

/** The calendar as GraphQL nests it: days grouped into the weeks of the graph. */
const calendarWith = (weeks: unknown[]) => ({
	data: { user: { contributionsCollection: { contributionCalendar: { weeks } } } },
});

const calendarBody = (counts: Record<string, number>) =>
	calendarWith([
		{
			contributionDays: Object.entries(counts).map(([date, contributionCount]) => ({
				date,
				contributionCount,
			})),
		},
	]);

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

const apiFetch = vi.fn((url: string, _init?: RequestInit) => {
	if (url.endsWith('/graphql')) return Promise.resolve(ok(calendarBody(DAY_COUNTS)));
	if (url.includes('/repos')) return Promise.resolve(ok([{ language: 'TypeScript' }]));
	if (url.includes('/events/public')) {
		return Promise.resolve(
			ok([{ type: 'PushEvent', created_at: '2026-07-05T00:00:00Z', repo: { name: 'ogadra/x' } }]),
		);
	}
	return Promise.resolve(ok({ public_repos: 42, followers: 7 }));
});

const waitUntil = vi.fn((_promise: Promise<unknown>) => {});

/** Awaits the writes that were handed off, so an assertion can see them land. */
const settleBackgroundWork = () => Promise.all(waitUntil.mock.calls.map(([promise]) => promise));

/** Never settles, so awaiting it would hang rather than merely slow a test down. */
const never = () => new Promise<never>(() => {});

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	store.readContributionHistory.mockResolvedValue({});
	store.writeContributionCounts.mockResolvedValue(undefined);
	store.readSnapshot.mockResolvedValue(null);
	store.writeSnapshot.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetAllMocks();
});

describe('fetchGithubStats', () => {
	it('returns live stats built from the API alone', async () => {
		vi.stubGlobal('fetch', apiFetch);

		const stats = await fetchGithubStats(unconfiguredEnv, waitUntil, NOW);

		assert(stats, 'the API answered, so the live path should have produced stats');
		expect(stats).toMatchObject({ publicRepos: 42, followers: 7, recentContributions: 5 });
		expect(stats.dailyContributions.at(-1)).toBe(3);
		expect(stats.dailyContributions.at(-2)).toBe(2);
		expect(stats.log[0]).toEqual({ label: 'PUSH ogadra/x', occurredAt: '2026-07-05T00:00:00Z' });
	});

	it('returns before either write settles', async () => {
		vi.stubGlobal('fetch', apiFetch);
		store.writeContributionCounts.mockReturnValue(never());
		store.writeSnapshot.mockReturnValue(never());

		expect(await fetchGithubStats(unconfiguredEnv, waitUntil, NOW)).toMatchObject({
			publicRepos: 42,
		});
	});

	it('hands both writes to the runtime to finish in the background', async () => {
		vi.stubGlobal('fetch', apiFetch);

		await fetchGithubStats(unconfiguredEnv, waitUntil, NOW);
		await settleBackgroundWork();

		// the whole calendar is recorded, so the fallback can answer past the sparkline window
		expect(store.writeContributionCounts).toHaveBeenCalledWith(DB, DAY_COUNTS, '2025-05-31');
		expect(store.writeSnapshot).toHaveBeenCalledWith(
			DB,
			GITHUB_CACHE,
			expect.objectContaining({ publicRepos: 42, followers: 7 }),
		);
	});

	it('never reads the store on the live path', async () => {
		vi.stubGlobal('fetch', apiFetch);

		await fetchGithubStats(unconfiguredEnv, waitUntil, NOW);
		await settleBackgroundWork();

		expect(store.readContributionHistory).not.toHaveBeenCalled();
	});

	it('pads the series to the full window when the calendar misses a day', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string, init?: RequestInit) =>
				url.endsWith('/graphql')
					? Promise.resolve(ok(calendarBody({ '2026-07-02': 7 })))
					: apiFetch(url, init),
			),
		);

		const stats = await fetchGithubStats(unconfiguredEnv, waitUntil, NOW);

		assert(stats, 'the API answered, so the live path should have produced stats');
		expect(stats.dailyContributions).toHaveLength(14);
		expect(stats.dailyContributions.at(-4)).toBe(7);
		expect(stats.recentContributions).toBe(7);
	});

	it('still returns the live stats when a background write fails', async () => {
		vi.stubGlobal('fetch', apiFetch);
		store.writeSnapshot.mockRejectedValue(new Error('D1 unavailable'));

		const stats = await fetchGithubStats(unconfiguredEnv, waitUntil, NOW);
		await settleBackgroundWork();

		expect(stats).toMatchObject({ publicRepos: 42 });
		expect(store.writeContributionCounts).toHaveBeenCalled();
	});

	// each parser guards a different endpoint, so a shape check that regressed in
	// one of them would otherwise go unnoticed until the page showed nonsense
	it.each([
		['user', '/users/ogadra', { public_repos: 'many', followers: 7 }],
		['repo list', '/repos?', { not: 'an array' }],
		['repo', '/repos?', [{ language: 42 }]],
		['event list', '/events/public', { not: 'an array' }],
		['event', '/events/public', [{ type: 'PushEvent', created_at: 1, repo: { name: 'x' } }]],
		['event repo', '/events/public', [{ type: 'PushEvent', created_at: '2026-07-05', repo: {} }]],
		['contribution calendar', '/graphql', { errors: [{ message: 'Bad credentials' }] }],
		['contribution week', '/graphql', calendarWith([{}])],
		[
			'contribution day',
			'/graphql',
			calendarWith([{ contributionDays: [{ date: '2026-07-05' }] }]),
		],
	])('falls back when the %s comes back in an unexpected shape', async (_shape, path, body) => {
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string) => (url.includes(path) ? Promise.resolve(ok(body)) : apiFetch(url))),
		);
		store.readSnapshot.mockResolvedValue(STORED_SNAPSHOT);

		expect(await fetchGithubStats(unconfiguredEnv, waitUntil, NOW)).toMatchObject({
			publicRepos: 41,
		});
	});

	it('falls back when the API refuses the request', async () => {
		// the rate limit answers 403, which is the reason app auth exists at all
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve({ ok: false, status: 403 })),
		);
		store.readSnapshot.mockResolvedValue(STORED_SNAPSHOT);

		expect(await fetchGithubStats(unconfiguredEnv, waitUntil, NOW)).toMatchObject({
			publicRepos: 41,
		});
	});

	it('falls back to the stored snapshot when the API fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		store.readSnapshot.mockResolvedValue(STORED_SNAPSHOT);

		expect(await fetchGithubStats(unconfiguredEnv, waitUntil, NOW)).toMatchObject({
			publicRepos: 41,
		});
	});

	it('returns null when the API fails and no snapshot exists', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));

		expect(await fetchGithubStats(unconfiguredEnv, waitUntil, NOW)).toBeNull();
	});

	it('returns null when the fallback read fails too', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rate limited')));
		store.readSnapshot.mockRejectedValue(new Error('D1 unavailable'));

		expect(await fetchGithubStats(unconfiguredEnv, waitUntil, NOW)).toBeNull();
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
		const configuredEnv: GithubEnv = { ...unconfiguredEnv, ...(await configuredAppEnv()) };
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string, init?: RequestInit) =>
				url.endsWith('/access_tokens')
					? Promise.resolve(ok({ token: 'minted-token' }))
					: apiFetch(url, init),
			),
		);

		await fetchGithubStats(configuredEnv, waitUntil, NOW);

		expect(authHeaders()).toEqual(['Bearer minted-token']);
	});

	it('sends no authorization header when app auth is not configured', async () => {
		vi.stubGlobal('fetch', apiFetch);

		await fetchGithubStats(unconfiguredEnv, waitUntil, NOW);

		expect(authHeaders()).toEqual([undefined]);
	});
});

describe('contributionSeries', () => {
	it('builds an oldest-to-newest series with zeros for missing days', () => {
		const history = { '2026-07-07': 4, '2026-07-05': 6 };
		expect(contributionSeries(history, at('2026-07-07T12:00:00Z'), 4)).toEqual([0, 6, 0, 4]);
	});

	it('leaves out days older than the window', () => {
		const history = { '2026-07-07': 4, '2026-07-01': 9 };
		expect(contributionSeries(history, at('2026-07-07T12:00:00Z'), 3)).toEqual([0, 0, 4]);
	});

	it('ends on the UTC day, not the local one', () => {
		const history = { '2026-07-07': 4, '2026-07-08': 8 };
		// both instants fall on 07-07 in UTC, so both series end on its count
		expect(contributionSeries(history, at('2026-07-07T00:00:00Z'), 2)).toEqual([0, 4]);
		expect(contributionSeries(history, at('2026-07-07T23:59:59Z'), 2)).toEqual([0, 4]);
		expect(contributionSeries(history, at('2026-07-08T00:00:00Z'), 2)).toEqual([4, 8]);
	});

	it('returns just today for a one-day window', () => {
		expect(contributionSeries({ '2026-07-07': 4 }, at('2026-07-07T12:00:00Z'), 1)).toEqual([4]);
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
