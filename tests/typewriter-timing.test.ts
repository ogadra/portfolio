import { describe, expect, it } from "vitest";
import { DEFAULT_TIMINGS, wordAnimationDuration } from "../src/lib/typewriter-timing";

describe("wordAnimationDuration", () => {
  it("matches the expected duration for the default timings", () => {
    // "Front-End" (9 chars): 90*9 + 2000 + 50*9 + 100 = 810 + 2000 + 450 + 100 = 3360
    expect(wordAnimationDuration(9)).toBe(3360);
  });

  it("scales linearly with word length", () => {
    const t = DEFAULT_TIMINGS;
    const base = t.displayMs + t.emptyMs;
    expect(wordAnimationDuration(0)).toBe(base);
    expect(wordAnimationDuration(1)).toBe(base + t.appendMs + t.removeMs);
    expect(wordAnimationDuration(14)).toBe(base + 14 * (t.appendMs + t.removeMs));
  });

  it("accepts custom timings", () => {
    expect(
      wordAnimationDuration(5, { appendMs: 100, removeMs: 100, displayMs: 1000, emptyMs: 0 }),
    ).toBe(2000);
  });
});
