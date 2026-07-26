import { describe, expect, it } from 'vitest';

import { TIP_BODY_MAX_LENGTH, TIP_CATEGORIES, shuffledTips } from './tip-library';

/** The library in a fixed order, for assertions that are about content rather than order. */
const all = shuffledTips(1);

/** Sorts by label so two orderings of the same library compare equal. */
function byLabel(tips: readonly { label: string }[]): string[] {
	return tips.map((tip) => tip.label).sort();
}

describe('the tip library', () => {
	it('is large enough to keep varying across several sittings', () => {
		expect(all.length).toBeGreaterThanOrEqual(45);
	});

	it('gives every tip a category, a label and a body', () => {
		for (const tip of all) {
			expect(tip.category.trim()).not.toBe('');
			expect(tip.label.trim()).not.toBe('');
			expect(tip.body.trim()).not.toBe('');
		}
	});

	/** A body past the limit is cut off by the ticker rather than wrapped. */
	it('keeps every body short enough for the ticker', () => {
		for (const tip of all) {
			expect(tip.body.length).toBeLessThanOrEqual(TIP_BODY_MAX_LENGTH);
		}
	});

	it('uses only declared categories', () => {
		for (const tip of all) {
			expect(TIP_CATEGORIES).toContain(tip.category);
		}
	});

	it('represents every declared category', () => {
		const present = new Set(all.map((tip) => tip.category));
		for (const category of TIP_CATEGORIES) {
			expect(present).toContain(category);
		}
	});

	it('never repeats a label', () => {
		expect(new Set(all.map((tip) => tip.label)).size).toBe(all.length);
	});

	/** The tips are exam advice; naming the machinery that produced them would be noise. */
	it('never names a tool or vendor outside the exam material', () => {
		const forbidden = [/claude/i, /anthropic/i, /chatgpt/i, /openai/i, /gemini/i, /copilot/i];
		const text = all.map((tip) => `${tip.category} ${tip.label} ${tip.body}`).join(' ');
		for (const pattern of forbidden) {
			expect(text).not.toMatch(pattern);
		}
	});
});

describe('shuffledTips', () => {
	it('is reproducible for the same seed', () => {
		expect(shuffledTips(4242)).toEqual(shuffledTips(4242));
	});

	it('orders differently for different seeds', () => {
		expect(shuffledTips(1)).not.toEqual(shuffledTips(2));
	});

	it('returns a permutation, losing and inventing nothing', () => {
		expect(byLabel(shuffledTips(99))).toEqual(byLabel(all));
	});

	it('returns only the requested category when one is given', () => {
		const timing = shuffledTips(7, 'timing');
		expect(timing.length).toBeGreaterThan(0);
		expect(timing.every((tip) => tip.category === 'timing')).toBe(true);
	});

	it('leaves the library intact for the next caller', () => {
		shuffledTips(5);
		expect(byLabel(shuffledTips(1))).toEqual(byLabel(all));
	});
});
