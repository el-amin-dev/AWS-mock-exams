/**
 * Deterministic pseudo-randomness.
 *
 * Every randomised decision the engine makes — question order, option order, and which
 * questions are drawn as unscored — must be reproducible from an attempt's seed. Using
 * `Math.random()` directly would re-roll on every render and, worse, would silently change
 * a candidate's unscored draw when an attempt is resumed after a refresh.
 */

/** A function returning successive pseudo-random numbers in [0, 1). */
export type RandomSource = () => number;

/**
 * Creates a seeded generator using the mulberry32 algorithm.
 *
 * Chosen for being small, dependency-free and stable across engines. Statistical quality is
 * far beyond what shuffling a 65-item list requires; it is not suitable for cryptography.
 *
 * @param seed Any 32-bit integer. The same seed always yields the same sequence.
 */
export function createRandom(seed: number): RandomSource {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Produces a seed for a fresh attempt. */
export function createSeed(): number {
	return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Returns a shuffled copy using a Fisher-Yates pass driven by `random`.
 *
 * The input is never mutated, so callers can keep the original presentation order.
 */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const a = result[i];
		const b = result[j];
		/* istanbul ignore next -- indices are always in range; this satisfies the checker */
		if (a === undefined || b === undefined) continue;
		result[i] = b;
		result[j] = a;
	}
	return result;
}

/**
 * Chooses `count` distinct indices from `[0, total)`.
 *
 * @returns The chosen indices in ascending order, for stable comparison and display.
 */
export function sampleIndices(total: number, count: number, random: RandomSource): number[] {
	const clamped = Math.max(0, Math.min(count, total));
	const pool = Array.from({ length: total }, (_, i) => i);
	return shuffle(pool, random)
		.slice(0, clamped)
		.sort((a, b) => a - b);
}
