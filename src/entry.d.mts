// Types for the worker entry the Astro Cloudflare adapter generates. The module
// itself only exists in dist/server after a build, and the bundle keeps the
// import external so the built entry resolves it at runtime.
declare const entry: {
	fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};

export default entry;
