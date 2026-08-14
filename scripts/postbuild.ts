// Runs after `astro build`. The Cloudflare adapter emits a worker whose entry
// (`entry.mjs`) only exports `fetch`. To use Cron Triggers we need a `scheduled`
// handler, so bundle a wrapper entry next to it and repoint the generated
// wrangler config's `main` at the bundle. The generated config sets
// `no_bundle`, so the wrapper has to arrive with its own imports resolved;
// `entry.mjs` stays external and is loaded as a sibling module at runtime.
// Cron schedules themselves come from wrangler.jsonc.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const SERVER_DIR = new URL('../dist/server/', import.meta.url);
const WRAPPER = 'worker.mjs';

await build({
	entryPoints: [fileURLToPath(new URL('./cronEntry.ts', import.meta.url))],
	outfile: fileURLToPath(new URL(WRAPPER, SERVER_DIR)),
	bundle: true,
	format: 'esm',
	platform: 'neutral',
	target: 'es2022',
	external: ['./entry.mjs'],
});

const configUrl = new URL('./wrangler.json', SERVER_DIR);
const config = JSON.parse(await readFile(configUrl, 'utf8'));
config.main = WRAPPER;
await writeFile(configUrl, JSON.stringify(config));

console.log(`[postbuild] wired ${WRAPPER} as worker main (scheduled handler for cron)`);
