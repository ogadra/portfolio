import { describe, expect, it, vi } from 'vite-plus/test';
import {
	readCommitHistory,
	readSnapshot,
	writeCommitCounts,
	writeSnapshot,
	type D1Database,
	type D1PreparedStatement,
	type KVNamespace,
	type Snapshot,
} from './githubStore';

/**
 * Stands in for D1 with rows keyed by the table their query names. `prepare` and
 * `bind` are spies, so a test reads the SQL and the values off their call lists.
 */
const fakeDb = (rows: Record<string, unknown[]> = {}) => {
	const bind = vi.fn();
	const prepare = vi.fn((query: string): D1PreparedStatement => {
		const results = Object.entries(rows).find(([table]) => query.includes(table))?.[1] ?? [];
		const statement: D1PreparedStatement = {
			bind: (...values) => {
				bind(...values);
				return statement;
			},
			all: <T>() => Promise.resolve({ results: results as T[] }),
		};
		return statement;
	});
	const db: D1Database = { prepare, batch: () => Promise.resolve([]) };
	const queries = () => prepare.mock.calls.map(([query]) => query);
	return { db, queries, bindings: () => bind.mock.calls };
};

const fakeKv = (initial: string | null = null) => {
	const put = vi.fn((_key: string, _value: string) => Promise.resolve());
	const kv: KVNamespace = {
		get: <T>() => Promise.resolve(initial === null ? null : (JSON.parse(initial) as T)),
		put,
	};
	return { kv, written: () => put.mock.calls.at(-1)?.[1] ?? null };
};

const SNAPSHOT: Snapshot = {
	publicRepos: 42,
	followers: 7,
	languages: [{ name: 'TypeScript', ratio: 0.8 }],
	log: [{ label: 'PUSH ogadra/portfolio', occurredAt: '2026-07-05T23:12:07Z' }],
};

describe('snapshot', () => {
	it('writes user stats to KV and leaves the lists to D1', async () => {
		const { db, queries } = fakeDb();
		const cache = fakeKv();
		await writeSnapshot(db, cache.kv, SNAPSHOT);
		expect(JSON.parse(cache.written() ?? 'null')).toEqual({ publicRepos: 42, followers: 7 });
		expect(queries().some((q) => q.includes('user_stats'))).toBe(false);
		expect(queries().filter((q) => q.includes('languages'))).toHaveLength(2);
		expect(queries().filter((q) => q.includes('event_log'))).toHaveLength(2);
	});

	it('binds each list row with the columns readSnapshot orders by', async () => {
		const { db, bindings } = fakeDb();
		await writeSnapshot(db, fakeKv().kv, {
			...SNAPSHOT,
			languages: [
				{ name: 'TypeScript', ratio: 0.8 },
				{ name: 'Go', ratio: 0.2 },
			],
			log: [
				{ label: 'PUSH ogadra/portfolio', occurredAt: '2026-07-05T23:12:07Z' },
				{ label: 'PULL_REQ ogadra/portfolio', occurredAt: '2026-07-04T08:41:52Z' },
			],
		});
		expect(bindings()).toEqual([
			['TypeScript', 0.8],
			['Go', 0.2],
			['2026-07-05T23:12:07Z', 'PUSH ogadra/portfolio'],
			['2026-07-04T08:41:52Z', 'PULL_REQ ogadra/portfolio'],
		]);
	});

	it('reassembles the snapshot from both stores', async () => {
		const { db } = fakeDb({
			languages: [{ name: 'TypeScript', ratio: 0.8 }],
			event_log: [{ label: 'PUSH ogadra/portfolio', occurredAt: '2026-07-05T23:12:07Z' }],
		});
		const cache = fakeKv(JSON.stringify({ publicRepos: 42, followers: 7 }));
		expect(await readSnapshot(db, cache.kv)).toEqual(SNAPSHOT);
	});

	it('returns null when KV holds no user stats', async () => {
		const { db } = fakeDb();
		expect(await readSnapshot(db, fakeKv().kv)).toBeNull();
	});
});

describe('commit history', () => {
	it('reads only the days at or after the requested start', async () => {
		const { db, queries, bindings } = fakeDb({
			commit_history: [{ day: '2026-07-05', count: 3 }],
		});
		expect(await readCommitHistory(db, '2026-06-22')).toEqual({ '2026-07-05': 3 });
		expect(queries()[0]).toBe('SELECT day, count FROM commit_history WHERE day >= ?');
		expect(bindings()[0]).toEqual(['2026-06-22']);
	});

	it('upserts every fresh day and prunes below the cutoff', async () => {
		const { db, queries, bindings } = fakeDb();
		await writeCommitCounts(db, { '2026-07-05': 3, '2026-07-04': 2 }, '2025-06-01');
		expect(queries().filter((q) => q.startsWith('INSERT INTO commit_history'))).toHaveLength(2);
		expect(queries().at(-1)).toBe('DELETE FROM commit_history WHERE day < ?');
		expect(bindings().at(-1)).toEqual(['2025-06-01']);
	});
});
