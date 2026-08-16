// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

// https://astro.build/config
export default defineConfig({
	site: 'https://ogadra.com',
	output: 'server',
	adapter: cloudflare({ imageService: 'passthrough' }),
	vite: {
		// Prebundle the passthrough image service so a cold dev start does not re-optimize mid-flight.
		optimizeDeps: {
			include: ['astro/assets/services/noop'],
		},
		plugins: [
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/paraglide',
				strategy: ['preferredLanguage', 'baseLocale'],
			}),
		],
	},
});
