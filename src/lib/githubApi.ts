// Shared by the stats fetcher and the GitHub App token exchange. Both talk to
// the same host as the same app, so the host, the headers and the timeout have
// to move together.

export const GITHUB_API = 'https://api.github.com';
export const FETCH_TIMEOUT_MS = 2500;

/** Headers every GitHub REST call carries; the token is absent when app auth is unconfigured. */
export const githubHeaders = (token: string | undefined): Record<string, string> => {
	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		'user-agent': 'ogadra.com',
	};
	if (token) headers.authorization = `Bearer ${token}`;
	return headers;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;
