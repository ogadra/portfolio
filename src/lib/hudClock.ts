const pad = (n: number) => String(n).padStart(2, '0');

export const formatHudDate = (d: Date): string =>
	`${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

export const formatHudTime = (d: Date): string =>
	`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Reads an instant off its ISO text, so the log keeps the UTC the API reports. */
export const formatLogStamp = (occurredAt: string): string =>
	`${occurredAt.slice(5, 10).replace('-', '/')} ${occurredAt.slice(11, 16)}`;
