// A snapshot write spans KV and D1, so it is not atomic; a torn one only mixes adjacent refreshes.

/** Contribution counts keyed by the `YYYY-MM-DD` UTC day they belong to. */
export type ContributionHistory = Record<string, number>;

export interface LanguageShare {
	name: string;
	ratio: number;
}

export interface Snapshot {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	log: { label: string; occurredAt: string }[];
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface KVNamespace {
	get<T>(key: string, type: 'json'): Promise<T | null>;
	put(key: string, value: string): Promise<void>;
}

interface UserStats {
	publicRepos: number;
	followers: number;
}

const USER_STATS_KEY = 'github:user_stats';

// The calendar reports every day of the year on each read, so it overwrites rather than accumulates.
const UPSERT_CONTRIBUTION = `INSERT INTO contribution_history (day, count) VALUES (?, ?)
ON CONFLICT(day) DO UPDATE SET count = excluded.count`;

export const readContributionHistory = async (
	db: D1Database,
	sinceDay: string,
): Promise<ContributionHistory> => {
	const { results } = await db
		.prepare('SELECT day, count FROM contribution_history WHERE day >= ?')
		.bind(sinceDay)
		.all<{ day: string; count: number }>();
	return Object.fromEntries(results.map((r) => [r.day, r.count]));
};

export const writeContributionCounts = async (
	db: D1Database,
	counts: ContributionHistory,
	cutoffDay: string,
): Promise<void> => {
	const upserts = Object.entries(counts).map(([day, count]) =>
		db.prepare(UPSERT_CONTRIBUTION).bind(day, count),
	);
	const prune = db.prepare('DELETE FROM contribution_history WHERE day < ?').bind(cutoffDay);
	await db.batch([...upserts, prune]);
};

export const readSnapshot = async (db: D1Database, kv: KVNamespace): Promise<Snapshot | null> => {
	const user = await kv.get<UserStats>(USER_STATS_KEY, 'json');
	if (!user) return null;
	const languages = await db
		.prepare('SELECT name, ratio FROM languages ORDER BY ratio DESC, name')
		.all<{ name: string; ratio: number }>();
	const log = await db
		.prepare('SELECT label, occurred_at AS occurredAt FROM event_log ORDER BY occurred_at DESC')
		.all<{ label: string; occurredAt: string }>();
	return {
		publicRepos: user.publicRepos,
		followers: user.followers,
		languages: languages.results,
		log: log.results,
	};
};

export const writeSnapshot = async (
	db: D1Database,
	kv: KVNamespace,
	snapshot: Snapshot,
): Promise<void> => {
	const statements: D1PreparedStatement[] = [
		db.prepare('DELETE FROM languages'),
		...snapshot.languages.map((l) =>
			db.prepare('INSERT INTO languages (name, ratio) VALUES (?, ?)').bind(l.name, l.ratio),
		),
		db.prepare('DELETE FROM event_log'),
		...snapshot.log.map((e) =>
			db
				.prepare('INSERT INTO event_log (occurred_at, label) VALUES (?, ?)')
				.bind(e.occurredAt, e.label),
		),
	];
	const stats: UserStats = {
		publicRepos: snapshot.publicRepos,
		followers: snapshot.followers,
	};
	await Promise.all([kv.put(USER_STATS_KEY, JSON.stringify(stats)), db.batch(statements)]);
};
