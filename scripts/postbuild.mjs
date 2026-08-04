// Runs after `astro build`. The Cloudflare adapter emits a worker whose entry
// (`entry.mjs`) only exports `fetch`. To use Cron Triggers we need a `scheduled`
// handler, so we drop in a wrapper entry and repoint the generated wrangler
// config's `main` at it. Cron schedules themselves come from wrangler.jsonc.
import { copyFile, readFile, writeFile } from 'node:fs/promises';

const SERVER_DIR = new URL('../dist/server/', import.meta.url);
const WRAPPER = 'worker.mjs';

await copyFile(new URL('./cron-entry.mjs', import.meta.url), new URL(WRAPPER, SERVER_DIR));

const configUrl = new URL('./wrangler.json', SERVER_DIR);
const config = JSON.parse(await readFile(configUrl, 'utf8'));
config.main = WRAPPER;
await writeFile(configUrl, JSON.stringify(config));

console.log(`[postbuild] wired ${WRAPPER} as worker main (scheduled handler for cron)`);
