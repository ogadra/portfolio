# Astro Starter Kit: Minimal

```sh
pnpm create astro@latest -- --template minimal
```

## Project Structure

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro maps every `.astro` or `.md` file in `src/pages/` to a route based on its file name.

Put Astro/React/Vue/Svelte/Preact components in `src/components/`. Put static assets like images in `public/`.

## Commands

Run these from the project root:

| Command                | Action                                           |
| :--------------------- | :----------------------------------------------- |
| `pnpm install`         | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |

## Agent Browser Automation

This repository supports Microsoft's `@playwright/cli` for LLM-agent browser
automation without adding it to the app's package dependencies. Use
`playwright-cli` when an agent needs to inspect or interact with a running page;
keep it separate from Playwright Test or E2E commands when those are added.

The CLI is installed in the agent environment, not through this app's
`package.json`:

```sh
npm install -g @playwright/cli@latest
playwright-cli --help
```

Use the Nix dev shell when available. It provides Chromium and configures
`@playwright/cli` to use that browser through `PWTEST_CLI_EXECUTABLE_PATH`, so no
browser download is needed after the CLI itself is available:

```sh
nix develop
playwright-cli open http://localhost:4321
```

Outside the Nix dev shell, install the browser used by `@playwright/cli` first.
On Linux systems, the downloaded browser may also need OS packages:

```sh
playwright-cli install-browser chromium --with-deps
```

Agents can use the raw CLI directly. A typical local flow is:

```sh
pnpm dev
playwright-cli open http://localhost:4321
playwright-cli snapshot
playwright-cli screenshot --filename=.playwright-cli/home.png
playwright-cli close
```

Use named sessions when multiple agents or workflows may run at the same time:

```sh
playwright-cli -s=portfolio open http://localhost:4321
playwright-cli -s=portfolio snapshot
playwright-cli -s=portfolio close
```

Install the upstream agent skills when your local agent supports `.agents/`
skills:

```sh
playwright-cli install --skills=agents
```

## References

- [Astro docs](https://docs.astro.build)
- [Astro Discord](https://astro.build/chat)
