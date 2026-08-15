import { defineConfig, devices } from '@playwright/test';
import { STATS_MODE, type StatsMode } from './src/lib/statsMode';

// GITHUB_STATS pins the home page data so a run never reaches api.github.com:
// one server serves the populated HUD, the other the offline HUD.
// reuseExistingServer only probes the URL, so these stay off wrangler's default
// 8787: a hand-started preview there would be adopted with the var unset.
const FIXTURE_PORT = 8891;
const OFFLINE_PORT = 8892;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const chromium = {
	...devices['Desktop Chrome'],
	...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
};

// both servers run at once, so each needs its own inspector port; wrangler
// otherwise binds 9229 twice and the second process dies on startup
const previewServer = (port: number, mode: StatsMode) => ({
	command: `pnpm preview --ip 127.0.0.1 --port ${port} --inspector-port ${port + 1000} --var GITHUB_STATS:${mode}`,
	url: `http://127.0.0.1:${port}`,
	reuseExistingServer: !process.env.CI,
	timeout: 120_000,
	env: {
		WRANGLER_SEND_METRICS: 'false',
	},
});

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? '50%' : undefined,
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }]]
		: [['list'], ['html', { open: 'never' }]],
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			testIgnore: '**/*.offline.spec.ts',
			use: { ...chromium, baseURL: externalBaseURL ?? `http://127.0.0.1:${FIXTURE_PORT}` },
		},
		// an external base URL serves whatever it was started with, so the offline
		// HUD can only be checked against a server this config owns
		...(externalBaseURL
			? []
			: [
					{
						name: 'chromium-offline',
						testMatch: '**/*.offline.spec.ts',
						use: { ...chromium, baseURL: `http://127.0.0.1:${OFFLINE_PORT}` },
					},
				]),
	],
	webServer: externalBaseURL
		? undefined
		: [
				previewServer(FIXTURE_PORT, STATS_MODE.fixture),
				previewServer(OFFLINE_PORT, STATS_MODE.offline),
			],
});
