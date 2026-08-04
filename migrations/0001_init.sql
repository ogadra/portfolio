CREATE TABLE commit_history (
	day TEXT PRIMARY KEY,
	count INTEGER NOT NULL
);

CREATE TABLE languages (
	position INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	ratio REAL NOT NULL
);

CREATE TABLE event_log (
	position INTEGER PRIMARY KEY,
	label TEXT NOT NULL,
	date TEXT NOT NULL
);
