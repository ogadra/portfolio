import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KVStore } from '../src/lib/github';
import { buildJwtClaims, getInstallationToken } from '../src/lib/githubApp';

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

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('buildJwtClaims', () => {
	it('backdates iat by 60s and expires 540s later', () => {
		const now = new Date('2026-07-05T00:10:00Z');
		const { payload } = buildJwtClaims('12345', now);
		expect(payload.iss).toBe('12345');
		expect(payload.iat).toBe(Math.floor(now.getTime() / 1000) - 60);
		expect(payload.exp - payload.iat).toBe(540);
	});
});

describe('getInstallationToken', () => {
	it('returns undefined when app auth is not configured', async () => {
		const token = await getInstallationToken(
			{
				GITHUB_APP_ID: '',
				GITHUB_APP_PRIVATE_KEY: '',
				GITHUB_APP_INSTALLATION_ID: '',
				GITHUB_CACHE: memoryKv(),
			},
			new Date(),
		);
		expect(token).toBeUndefined();
	});

	it('reuses the KV-cached token until close to expiry', async () => {
		const kv = memoryKv();
		const now = new Date('2026-07-05T00:00:00Z');
		kv.store.set(
			'github-app-token:v1',
			JSON.stringify({ token: 'cached-token', expiresAt: now.getTime() + 30 * 60 * 1000 }),
		);
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const token = await getInstallationToken(
			{
				GITHUB_APP_ID: '12345',
				GITHUB_APP_PRIVATE_KEY: 'unused',
				GITHUB_APP_INSTALLATION_ID: '67890',
				GITHUB_CACHE: kv,
			},
			now,
		);
		expect(token).toBe('cached-token');
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
