export interface Tick {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	isMain: boolean;
}

export interface RadialTicksOptions {
	/** Centre of the ring, in the SVG user units of the viewBox. */
	center: number;
	count: number;
	/** Inner radius of a minor tick; main ticks start further in. */
	radius: number;
	/** Outer radius every tick reaches. */
	outerRadius: number;
	mainRadius: number;
	/** Every nth tick is a main one. Pass count to keep them all minor. */
	mainEvery: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Tick marks laid out clockwise around a ring, starting at 3 o'clock. */
export const radialTicks = ({
	center,
	count,
	radius,
	outerRadius,
	mainRadius,
	mainEvery,
}: RadialTicksOptions): Tick[] =>
	Array.from({ length: count }, (_, i) => {
		const angle = (i * Math.PI * 2) / count;
		const isMain = i % mainEvery === 0;
		const inner = isMain ? mainRadius : radius;
		return {
			x1: round(center + inner * Math.cos(angle)),
			y1: round(center + inner * Math.sin(angle)),
			x2: round(center + outerRadius * Math.cos(angle)),
			y2: round(center + outerRadius * Math.sin(angle)),
			isMain,
		};
	});
