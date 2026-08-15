/**
 * Test-only key material. Generated per run rather than checked in, so the PEM
 * these helpers build is a literal header around a throwaway key, never a
 * secret. Both githubApp and github exercise app auth, so the generation lives
 * here instead of once per test file.
 */
const generateRsaKey = async (): Promise<CryptoKey> => {
	const { privateKey } = (await crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256',
		},
		true,
		['sign', 'verify'],
	)) as CryptoKeyPair;
	return privateKey;
};

/** A PKCS#8 PEM in the wrapped-at-64-columns form GitHub hands out. */
export const generatePrivateKeyPem = async (): Promise<string> => {
	const pkcs8 = await crypto.subtle.exportKey('pkcs8', await generateRsaKey());
	const base64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
	const wrapped = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
	return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
};

/** The three vars getInstallationToken needs, backed by a fresh key. */
export const configuredAppEnv = async () => ({
	GITHUB_APP_ID: '12345',
	GITHUB_APP_PRIVATE_KEY: await generatePrivateKeyPem(),
	GITHUB_APP_INSTALLATION_ID: '67890',
});
