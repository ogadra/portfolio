import { describe, expect, it } from 'vite-plus/test';
import {
	cloudflareStore,
	type D1Database,
	type D1PreparedStatement,
	type KVNamespace,
	type Snapshot,
} from './githubStore';

const fakeDb = (rows: Record<string, unknown[]> = {}) => {
	const queries: string[] = [];
	const bindings: unknown[][] = [];
	const db: D1Database = {
		prepare(query) {
			queries.push(query);
			const results = Object.entries(rows).find(([table]) => query.includes(table))?.[1] ?? [];
			const statement: D1PreparedStatement = {
				bind: (...values) => {
					bindings.push(values);
					return statement;
				},
				all: <T>() => Promise.resolve({ results: results as T[] }),
			};
			return statement;
		},
		batch: () => Promise.resolve([]),
	};
	return { db, queries, bindings };
};

const fakeKv = (initial: string | null = null) => {
	let value = initial;
	const kv: KVNamespace = {
		get: <T>() => Promise.resolve(value === null ? null : (JSON.parse(value) as T)),
		put: (_key, next) => {
			value = next;
			return Promise.resolve();
		},
	};
	return {
		kv,
		get value() {
			return value;
		},
	};
};

const SNAPSHOT: Snapshot = {
	publicRepos: 42,
	followers: 7,
	languages: [{ name: 'TypeScript', ratio: 0.8 }],
	log: [{ label: 'PUSH ogadra/portfolio', date: '07.05' }],
};

describe('cloudflareStore snapshot', () => {
	it('writes user stats to KV and leaves the lists to D1', async () => {
		const { db, queries } = fakeDb();
		const cache = fakeKv();
		await cloudflareStore(db, cache.kv).writeSnapshot(SNAPSHOT);
		expect(JSON.parse(cache.value ?? 'null')).toEqual({ publicRepos: 42, followers: 7 });
		expect(queries.some((q) => q.includes('user_stats'))).toBe(false);
		expect(queries.filter((q) => q.includes('languages'))).toHaveLength(2);
		expect(queries.filter((q) => q.includes('event_log'))).toHaveLength(2);
	});

	it('binds each list row with the position readSnapshot orders by', async () => {
		const { db, bindings } = fakeDb();
		await cloudflareStore(db, fakeKv().kv).writeSnapshot({
			...SNAPSHOT,
			languages: [
				{ name: 'TypeScript', ratio: 0.8 },
				{ name: 'Go', ratio: 0.2 },
			],
			log: [
				{ label: 'PUSH ogadra/portfolio', date: '07.05' },
				{ label: 'PR ogadra/portfolio', date: '07.04' },
			],
		});
		expect(bindings).toEqual([
			[0, 'TypeScript', 0.8],
			[1, 'Go', 0.2],
			[0, 'PUSH ogadra/portfolio', '07.05'],
			[1, 'PR ogadra/portfolio', '07.04'],
		]);
	});

	it('reassembles the snapshot from both stores', async () => {
		const { db } = fakeDb({
			languages: [{ name: 'TypeScript', ratio: 0.8 }],
			event_log: [{ label: 'PUSH ogadra/portfolio', date: '07.05' }],
		});
		const cache = fakeKv(JSON.stringify({ publicRepos: 42, followers: 7 }));
		expect(await cloudflareStore(db, cache.kv).readSnapshot()).toEqual(SNAPSHOT);
	});

	it('returns null when KV holds no user stats', async () => {
		const { db } = fakeDb();
		expect(await cloudflareStore(db, fakeKv().kv).readSnapshot()).toBeNull();
	});
});

describe('cloudflareStore commit history', () => {
	it('reads only the days at or after the requested start', async () => {
		const { db, queries, bindings } = fakeDb({
			commit_history: [{ day: '2026-07-05', count: 3 }],
		});
		const history = await cloudflareStore(db, fakeKv().kv).readCommitHistory('2026-06-22');
		expect(history).toEqual({ '2026-07-05': 3 });
		expect(queries[0]).toBe('SELECT day, count FROM commit_history WHERE day >= ?');
		expect(bindings[0]).toEqual(['2026-06-22']);
	});

	it('upserts every fresh day and prunes below the cutoff', async () => {
		const { db, queries, bindings } = fakeDb();
		await cloudflareStore(db, fakeKv().kv).writeCommitCounts(
			{ '2026-07-05': 3, '2026-07-04': 2 },
			'2025-06-01',
		);
		expect(queries.filter((q) => q.startsWith('INSERT INTO commit_history'))).toHaveLength(2);
		expect(queries.at(-1)).toBe('DELETE FROM commit_history WHERE day < ?');
		expect(bindings.at(-1)).toEqual(['2025-06-01']);
	});
});
