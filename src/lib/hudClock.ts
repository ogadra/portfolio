const pad = (n: number) => String(n).padStart(2, '0');

export const formatHudDate = (d: Date): string =>
	`${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

export const formatHudTime = (d: Date): string =>
	`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
