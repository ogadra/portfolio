const GITHUB_USER = 'ogadra';
const TWITTER_USER = 'const_myself';

/** The one place the site's own identity is written down. */
export const PROFILE = {
	siteName: 'ogadra.com',
	role: 'SOFTWARE ENGINEER',
	/** Ordered as the MAGI units read them, and matched against GitHub's language names. */
	stack: ['TypeScript', 'Go', 'HCL'],
	github: {
		url: `https://github.com/${GITHUB_USER}`,
		label: `github.com/${GITHUB_USER}`,
	},
	twitter: {
		url: `https://twitter.com/${TWITTER_USER}`,
		label: `@${TWITTER_USER}`,
	},
} as const;
