import { describe, expect, it } from 'vitest';

import { createRandom, createSeed, sampleIndices, shuffle } from './random';

describe('createRandom', () => {
	it('produces the same sequence for the same seed', () => {
		const draw = (seed: number) => Array.from({ length: 10 }, createRandom(seed));
		expect(draw(42)).toEqual(draw(42));
	});

	it('produces different sequences for different seeds', () => {
		expect(Array.from({ length: 5 }, createRandom(1))).not.toEqual(
			Array.from({ length: 5 }, createRandom(2))
		);
	});

	it('stays within [0, 1)', () => {
		const random = createRandom(7);
		for (let i = 0; i < 500; i++) {
			const value = random();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('produces a seed inside the 32-bit unsigned range', () => {
		const seed = createSeed();
		expect(Number.isInteger(seed)).toBe(true);
		expect(seed).toBeGreaterThanOrEqual(0);
		expect(seed).toBeLessThanOrEqual(0xffffffff);
	});
});

describe('shuffle', () => {
	const items = [1, 2, 3, 4, 5, 6, 7, 8];

	it('does not mutate its input', () => {
		const original = [...items];
		shuffle(items, createRandom(3));
		expect(items).toEqual(original);
	});

	it('returns a permutation, losing and inventing nothing', () => {
		const result = shuffle(items, createRandom(3));
		expect([...result].sort((a, b) => a - b)).toEqual(items);
	});

	it('is reproducible from the seed', () => {
		expect(shuffle(items, createRandom(9))).toEqual(shuffle(items, createRandom(9)));
	});

	it('actually reorders', () => {
		const seeds = [1, 2, 3, 4, 5];
		expect(seeds.some((seed) => !arraysEqual(shuffle(items, createRandom(seed)), items))).toBe(
			true
		);
	});

	it('handles empty and single-element inputs', () => {
		expect(shuffle([], createRandom(1))).toEqual([]);
		expect(shuffle(['only'], createRandom(1))).toEqual(['only']);
	});
});

describe('sampleIndices', () => {
	it('returns the requested number of indices', () => {
		expect(sampleIndices(20, 5, createRandom(1))).toHaveLength(5);
	});

	it('returns distinct indices inside the range', () => {
		const result = sampleIndices(20, 8, createRandom(2));
		expect(new Set(result).size).toBe(8);
		expect(Math.min(...result)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...result)).toBeLessThan(20);
	});

	it('returns them in ascending order for stable comparison', () => {
		const result = sampleIndices(30, 10, createRandom(3));
		expect(result).toEqual([...result].sort((a, b) => a - b));
	});

	it('clamps a request larger than the pool', () => {
		expect(sampleIndices(4, 99, createRandom(1))).toEqual([0, 1, 2, 3]);
	});

	it('returns nothing for a zero or negative request', () => {
		expect(sampleIndices(10, 0, createRandom(1))).toEqual([]);
		expect(sampleIndices(10, -3, createRandom(1))).toEqual([]);
	});

	it('is reproducible from the seed', () => {
		expect(sampleIndices(50, 12, createRandom(11))).toEqual(
			sampleIndices(50, 12, createRandom(11))
		);
	});
});

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}
