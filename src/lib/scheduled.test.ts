import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { GithubEnv } from './github';
import { runScheduled } from './scheduled';

const github = vi.hoisted(() => ({ fetchGithubStats: vi.fn() }));

vi.mock('./github', () => github);

const unreachable = (): never => {
	throw new Error('the fetcher is mocked, so no query should reach the bindings');
};

const ENV = {
	GITHUB_APP_ID: '',
	GITHUB_APP_PRIVATE_KEY: '',
	GITHUB_APP_INSTALLATION_ID: '',
	DB: { prepare: unreachable, batch: unreachable },
	GITHUB_CACHE: { get: unreachable, put: unreachable },
} as GithubEnv;

const context = () => {
	const waitUntil = vi.fn((_promise: Promise<unknown>) => {});
	return { waitUntil };
};

afterEach(() => {
	vi.resetAllMocks();
});

describe('runScheduled', () => {
	it('refreshes the stats with the env the trigger handed over', async () => {
		github.fetchGithubStats.mockResolvedValue({ publicRepos: 42 });
		const ctx = context();

		await runScheduled(ENV, ctx);

		expect(github.fetchGithubStats).toHaveBeenCalledWith(ENV, expect.any(Function));
	});

	it('passes background writes on to the runtime', async () => {
		const write = Promise.resolve();
		github.fetchGithubStats.mockImplementation(
			(_env: GithubEnv, waitUntil: (p: Promise<unknown>) => void) => {
				waitUntil(write);
				return Promise.resolve({ publicRepos: 42 });
			},
		);
		const ctx = context();

		await runScheduled(ENV, ctx);

		expect(ctx.waitUntil).toHaveBeenCalledWith(write);
	});

	it('fails the run when the refresh produced nothing, so cron does not record a success', async () => {
		github.fetchGithubStats.mockResolvedValue(null);

		await expect(runScheduled(ENV, context())).rejects.toThrow(/no stats/);
	});
});
