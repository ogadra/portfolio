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

## References

- [Astro docs](https://docs.astro.build)
- [Astro Discord](https://astro.build/chat)
