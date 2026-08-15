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

interface Statement {
	query: string;
	values?: unknown[];
}

/**
 * Stands in for D1 with rows keyed by the table their query names. Each prepared
 * statement keeps the SQL and the values it was bound with, and `batch` records
 * which of them it was handed — preparing a statement and then leaving it out of
 * the batch has to read as a failure, not as a passing test.
 */
const fakeDb = (rows: Record<string, unknown[]> = {}) => {
	const records = new WeakMap<D1PreparedStatement, Statement>();
	const prepared: Statement[] = [];
	const batches: Statement[][] = [];

	const db: D1Database = {
		prepare(query) {
			const record: Statement = { query };
			prepared.push(record);
			const results = Object.entries(rows).find(([table]) => query.includes(table))?.[1] ?? [];
			const statement: D1PreparedStatement = {
				bind: (...values) => {
					record.values = values;
					return statement;
				},
				all: <T>() => Promise.resolve({ results: results as T[] }),
			};
			records.set(statement, record);
			return statement;
		},
		batch(statements) {
			batches.push(statements.map((s) => records.get(s) ?? { query: '<foreign statement>' }));
			return Promise.resolve([]);
		},
	};

	return {
		db,
		queries: () => prepared.map((r) => r.query),
		bindings: () => prepared.flatMap((r) => (r.values ? [r.values] : [])),
		/** The statements of the last batch, in the order they were handed over. */
		batched: () => batches.at(-1) ?? [],
	};
};

const fakeKv = (initial: string | null = null) => {
	const put = vi.fn((_key: string, _value: string) => Promise.resolve());
	const kv: KVNamespace = {
		get: <T>() => Promise.resolve(initial === null ? null : (JSON.parse(initial) as T)),
		put,
	};
	return { kv, written: () => put.mock.calls.at(-1)?.[1] ?? null };
};

// ratios are whole percents, the scale languageRatio produces
const SNAPSHOT: Snapshot = {
	publicRepos: 42,
	followers: 7,
	languages: [{ name: 'TypeScript', ratio: 80 }],
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
				{ name: 'TypeScript', ratio: 80 },
				{ name: 'Go', ratio: 20 },
			],
			log: [
				{ label: 'PUSH ogadra/portfolio', occurredAt: '2026-07-05T23:12:07Z' },
				{ label: 'PULL_REQ ogadra/portfolio', occurredAt: '2026-07-04T08:41:52Z' },
			],
		});
		expect(bindings()).toEqual([
			['TypeScript', 80],
			['Go', 20],
			['2026-07-05T23:12:07Z', 'PUSH ogadra/portfolio'],
			['2026-07-04T08:41:52Z', 'PULL_REQ ogadra/portfolio'],
		]);
	});

	it('hands every prepared statement to the same batch', async () => {
		const { db, batched } = fakeDb();
		await writeSnapshot(db, fakeKv().kv, SNAPSHOT);
		expect(batched()).toEqual([
			{ query: 'DELETE FROM languages' },
			{ query: 'INSERT INTO languages (name, ratio) VALUES (?, ?)', values: ['TypeScript', 80] },
			{ query: 'DELETE FROM event_log' },
			{
				query: 'INSERT INTO event_log (occurred_at, label) VALUES (?, ?)',
				values: ['2026-07-05T23:12:07Z', 'PUSH ogadra/portfolio'],
			},
		]);
	});

	it('reassembles the snapshot from both stores', async () => {
		const { db } = fakeDb({
			languages: [{ name: 'TypeScript', ratio: 80 }],
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

	it('sends the upserts and the prune as one batch', async () => {
		const { db, batched } = fakeDb();
		await writeCommitCounts(db, { '2026-07-05': 3, '2026-07-04': 2 }, '2025-06-01');
		expect(batched().map((s) => s.values)).toEqual([
			['2026-07-05', 3],
			['2026-07-04', 2],
			['2025-06-01'],
		]);
	});
});
