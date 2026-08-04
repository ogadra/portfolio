import { describe, expect, it } from 'vite-plus/test';
import { radialTicks } from './reticle';

describe('radialTicks', () => {
	it("starts at 3 o'clock and walks clockwise", () => {
		const ticks = radialTicks({
			center: 100,
			count: 4,
			radius: 80,
			outerRadius: 90,
			mainRadius: 80,
			mainEvery: 1,
		});
		expect(ticks.map((t) => [t.x1, t.y1])).toEqual([
			[180, 100],
			[100, 180],
			[20, 100],
			[100, 20],
		]);
		expect(ticks.map((t) => [t.x2, t.y2])).toEqual([
			[190, 100],
			[100, 190],
			[10, 100],
			[100, 10],
		]);
	});

	it('pulls every nth tick further in and flags it', () => {
		const ticks = radialTicks({
			center: 0,
			count: 4,
			radius: 8,
			outerRadius: 10,
			mainRadius: 6,
			mainEvery: 2,
		});
		expect(ticks.map((t) => t.isMain)).toEqual([true, false, true, false]);
		expect(ticks[0].x1).toBe(6);
		expect(ticks[1].y1).toBe(8);
	});

	it('rounds coordinates to two decimals', () => {
		const ticks = radialTicks({
			center: 0,
			count: 8,
			radius: 10,
			outerRadius: 10,
			mainRadius: 10,
			mainEvery: 8,
		});
		expect(ticks[0]).toEqual({ x1: 10, y1: 0, x2: 10, y2: 0, isMain: true });
		expect(ticks[1]).toEqual({ x1: 7.07, y1: 7.07, x2: 7.07, y2: 7.07, isMain: false });
	});
});
