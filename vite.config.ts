import { defineConfig } from 'vite-plus';

export default defineConfig({
	lint: {
		plugins: ['typescript', 'unicorn'],
		categories: {
			correctness: 'error',
			suspicious: 'warn',
			perf: 'warn',
		},
		rules: {
			'no-await-in-loop': 'off',
		},
		ignorePatterns: ['dist', '.astro', 'src/paraglide', 'node_modules', '.wrangler'],
	},
	fmt: {
		useTabs: true,
		tabWidth: 2,
		printWidth: 100,
		singleQuote: true,
		trailingComma: 'all',
		semi: true,
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
	},
});
