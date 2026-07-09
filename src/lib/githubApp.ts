import type { KVStore } from './github';

const TOKEN_KV_KEY = 'github-app-token:v1';
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const JWT_LIFETIME_S = 540;
const FETCH_TIMEOUT_MS = 2500;

export interface GithubAppEnv {
	GITHUB_APP_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	GITHUB_APP_INSTALLATION_ID: string;
	GITHUB_CACHE: KVStore;
}

interface CachedToken {
	token: string;
	expiresAt: number;
}

const base64urlFromBytes = (bytes: Uint8Array): string => {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const base64url = (text: string): string => base64urlFromBytes(new TextEncoder().encode(text));

const pemToPkcs8 = (pem: string): Uint8Array<ArrayBuffer> => {
	if (pem.includes('BEGIN RSA PRIVATE KEY')) {
		throw new Error(
			'GITHUB_APP_PRIVATE_KEY is PKCS#1. Convert it with: openssl pkcs8 -topk8 -nocrypt -in key.pem',
		);
	}
	const body = pem
		.replace(/\\n/g, '\n')
		.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
		.replace(/\s/g, '');
	const raw = atob(body);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
};

/** JWT header/payload as GitHub App auth expects them; pure for testability. */
export const buildJwtClaims = (appId: string, now: Date) => {
	const iat = Math.floor(now.getTime() / 1000) - 60;
	return {
		header: { alg: 'RS256', typ: 'JWT' },
		payload: { iat, exp: iat + JWT_LIFETIME_S, iss: appId },
	};
};

export const createAppJwt = async (
	appId: string,
	privateKeyPem: string,
	now: Date,
): Promise<string> => {
	const { header, payload } = buildJwtClaims(appId, now);
	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
	const key = await crypto.subtle.importKey(
		'pkcs8',
		pemToPkcs8(privateKeyPem),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(signingInput),
	);
	return `${signingInput}.${base64urlFromBytes(new Uint8Array(signature))}`;
};

/**
 * Returns a short-lived installation access token, reusing the KV-cached one
 * until shortly before expiry. Resolves to undefined when app auth is not
 * configured or fails, so callers can fall back to unauthenticated requests.
 */
export const getInstallationToken = async (
	env: GithubAppEnv,
	now: Date,
): Promise<string | undefined> => {
	if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_INSTALLATION_ID) {
		return undefined;
	}
	try {
		const cached = await env.GITHUB_CACHE.get(TOKEN_KV_KEY);
		if (cached) {
			const parsed = JSON.parse(cached) as CachedToken;
			if (parsed.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now.getTime()) return parsed.token;
		}
		const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY, now);
		const res = await fetch(
			`https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
			{
				method: 'POST',
				headers: {
					accept: 'application/vnd.github+json',
					authorization: `Bearer ${jwt}`,
					'user-agent': 'ogadra.com',
				},
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			},
		);
		if (!res.ok) throw new Error(`GitHub App token exchange responded with ${res.status}`);
		const body = (await res.json()) as { token: string; expires_at: string };
		const record: CachedToken = { token: body.token, expiresAt: Date.parse(body.expires_at) };
		await env.GITHUB_CACHE.put(TOKEN_KV_KEY, JSON.stringify(record));
		return body.token;
	} catch (error) {
		console.error('[github] app auth failed:', error);
		return undefined;
	}
};
