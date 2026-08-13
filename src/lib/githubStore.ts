import type { CommitHistory } from './commitHistory';
import type { LanguageShare } from './githubStats';

export interface Snapshot {
	publicRepos: number;
	followers: number;
	languages: LanguageShare[];
	log: { label: string; occurredAt: string }[];
}

export interface GithubStore {
	readCommitHistory(sinceDay: string): Promise<CommitHistory>;
	writeCommitCounts(counts: CommitHistory, cutoffDay: string): Promise<void>;
	readSnapshot(): Promise<Snapshot | null>;
	writeSnapshot(snapshot: Snapshot): Promise<void>;
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

const UPSERT_COMMIT = `INSERT INTO commit_history (day, count) VALUES (?, ?)
ON CONFLICT(day) DO UPDATE SET count = MAX(count, excluded.count)`;

/**
 * Splits the snapshot across both stores: the single-row user stats live in KV,
 * the language and event lists stay in D1 alongside the commit history. A
 * snapshot write therefore spans two stores and is not atomic; a torn write only
 * mixes counters from adjacent refreshes, which the fallback path tolerates.
 */
export const cloudflareStore = (db: D1Database, kv: KVNamespace): GithubStore => ({
	async readCommitHistory(sinceDay) {
		const { results } = await db
			.prepare('SELECT day, count FROM commit_history WHERE day >= ?')
			.bind(sinceDay)
			.all<{ day: string; count: number }>();
		return Object.fromEntries(results.map((r) => [r.day, r.count]));
	},

	async writeCommitCounts(counts, cutoffDay) {
		const upserts = Object.entries(counts).map(([day, count]) =>
			db.prepare(UPSERT_COMMIT).bind(day, count),
		);
		const prune = db.prepare('DELETE FROM commit_history WHERE day < ?').bind(cutoffDay);
		await db.batch([...upserts, prune]);
	},

	async readSnapshot() {
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
	},

	async writeSnapshot(snapshot) {
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
	},
});
