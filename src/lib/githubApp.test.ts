import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { configuredAppEnv as configuredEnv } from './githubApp.fixture';
import { buildJwtClaims, getInstallationToken } from './githubApp';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('buildJwtClaims', () => {
	it('backdates iat by 60s and expires 540s later', () => {
		const now = Temporal.Instant.from('2026-07-05T00:10:00Z');
		const { payload } = buildJwtClaims('12345', now);
		expect(payload.iss).toBe('12345');
		expect(payload.iat).toBe(Math.floor(now.epochMilliseconds / 1000) - 60);
		expect(payload.exp - payload.iat).toBe(540);
	});
});

describe('getInstallationToken', () => {
	it('returns undefined when app auth is not configured', async () => {
		const token = await getInstallationToken(
			{ GITHUB_APP_ID: '', GITHUB_APP_PRIVATE_KEY: '', GITHUB_APP_INSTALLATION_ID: '' },
			Temporal.Now.instant(),
		);
		expect(token).toBeUndefined();
	});

	it('mints a fresh token on every call', async () => {
		const env = await configuredEnv();
		const fetchSpy = vi.fn(() =>
			Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'minted-token' }) }),
		);
		vi.stubGlobal('fetch', fetchSpy);
		const now = Temporal.Instant.from('2026-07-05T00:00:00Z');
		expect(await getInstallationToken(env, now)).toBe('minted-token');
		expect(await getInstallationToken(env, now)).toBe('minted-token');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://api.github.com/app/installations/67890/access_tokens');
		expect(init.method).toBe('POST');
	});

	it('accepts the single-line PEM the deploy vars carry', async () => {
		const env = await configuredEnv();
		const fetchSpy = vi.fn(() =>
			Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'minted-token' }) }),
		);
		vi.stubGlobal('fetch', fetchSpy);
		const singleLine = {
			...env,
			GITHUB_APP_PRIVATE_KEY: env.GITHUB_APP_PRIVATE_KEY.split('\n').join('\\n'),
		};
		expect(await getInstallationToken(singleLine, Temporal.Now.instant())).toBe('minted-token');
	});

	it('names the conversion when handed a PKCS#1 key', async () => {
		const errors: unknown[] = [];
		vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(...args));
		const token = await getInstallationToken(
			{
				GITHUB_APP_ID: '12345',
				GITHUB_APP_PRIVATE_KEY:
					'-----BEGIN RSA PRIVATE KEY-----\nMII\n-----END RSA PRIVATE KEY-----',
				GITHUB_APP_INSTALLATION_ID: '67890',
			},
			Temporal.Now.instant(),
		);
		expect(token).toBeUndefined();
		expect(String(errors.at(-1))).toContain('openssl pkcs8 -topk8');
	});

	it('returns undefined when the token exchange fails', async () => {
		const env = await configuredEnv();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve({ ok: false, status: 401 })),
		);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await getInstallationToken(env, Temporal.Now.instant())).toBeUndefined();
	});

	it('reports a 2xx body that carries no token instead of passing it off as unconfigured', async () => {
		const env = await configuredEnv();
		const errors: unknown[] = [];
		vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(...args));
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ expires_at: 'x' }) })),
		);

		expect(await getInstallationToken(env, Temporal.Now.instant())).toBeUndefined();
		expect(String(errors.at(-1))).toContain('token');
	});
});
