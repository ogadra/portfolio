CREATE TABLE commit_history (
	day TEXT PRIMARY KEY,
	count INTEGER NOT NULL
);

CREATE TABLE languages (
	name TEXT PRIMARY KEY,
	ratio REAL NOT NULL
);

CREATE TABLE event_log (
	occurred_at TEXT NOT NULL,
	label TEXT NOT NULL
);
