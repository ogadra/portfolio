// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

// https://astro.build/config
export default defineConfig({
  site: "https://ogadra.com",
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  vite: {
    plugins: [
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["preferredLanguage", "baseLocale"],
      }),
    ],
  },
});
