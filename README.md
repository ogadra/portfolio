# ogadra.com portfolio

Astro SSR portfolio deployed to Cloudflare Workers.

## Project Structure

```text
/
├── messages/
├── public/
├── src/
├── tests/
│   ├── e2e/
│   └── typewriterTiming.test.ts
├── astro.config.mjs
├── playwright.config.ts
└── wrangler.jsonc
```

## Commands

Run these from the project root:

| Command                             | Action                                                   |
| :---------------------------------- | :------------------------------------------------------- |
| `pnpm install`                      | Install dependencies                                     |
| `pnpm dev`                          | Start the Astro dev server at `localhost:4321`           |
| `pnpm build`                        | Build the Cloudflare Workers SSR output to `./dist/`     |
| `pnpm preview`                      | Preview the built Worker locally with Wrangler           |
| `pnpm check`                        | Run Astro checks and vite-plus format/lint checks        |
| `pnpm test`                         | Run unit tests                                           |
| `pnpm test:e2e`                     | Build, preview, and run Playwright E2E tests in Chromium |
| `pnpm exec playwright install`      | Install Playwright browsers outside the Nix dev shell    |
| `pnpm exec playwright install-deps` | Install OS packages needed by Playwright browsers        |
| `pnpm deploy`                       | Build and deploy with Wrangler                           |

## E2E

The E2E suite uses Playwright against the production-like Wrangler preview. The
Playwright config starts `pnpm build && pnpm preview` automatically unless
`PLAYWRIGHT_BASE_URL` is set.

The Nix dev shell provides Chromium and configures Playwright to use it:

```sh
nix develop
pnpm test:e2e
```

Outside the Nix dev shell, install Playwright's browser bundle first:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

If the downloaded Chromium cannot run in the local environment, point Playwright
at an existing Chrome-compatible browser:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(which google-chrome)" pnpm test:e2e
```
