import { describe, expect, it } from 'vitest';

import { makeQuestion } from '../../../tests/factories';
import { tipsFor } from './tips';

/** Joins every tip body so a spec can assert on wording without indexing. */
function bodies(question = makeQuestion(), required = 1): string {
	return tipsFor(question, required)
		.map((tip) => `${tip.label}: ${tip.body}`)
		.join(' | ');
}

describe('tipsFor', () => {
	it('always offers technique advice', () => {
		expect(bodies()).toContain('Technique');
		expect(bodies()).toContain('constraint');
	});

	it('tells a single-answer question to eliminate first', () => {
		expect(bodies(makeQuestion({ correct: [0] }), 1)).toContain('Eliminate first');
	});

	/** The all-or-nothing rule is the most expensive thing to forget. */
	it('warns a multi-answer question that there is no partial credit', () => {
		const tips = bodies(makeQuestion({ correct: [0, 1] }), 2);
		expect(tips).toContain('all or nothing');
		expect(tips).toContain('scores zero');
	});

	it('does not warn about partial credit on a single-answer question', () => {
		expect(bodies(makeQuestion({ correct: [0] }), 1)).not.toContain('all or nothing');
	});

	it('reveals the area being tested, which is hidden by default', () => {
		const question = makeQuestion({ topic: 'VPC routing', domain: 'Secure' });
		expect(bodies(question)).toContain('VPC routing · Secure');
	});

	it('omits the domain when the question does not declare one', () => {
		const question = makeQuestion({ topic: 'VPC routing' });
		const area = tipsFor(question, 1).find((tip) => tip.label === 'What this is testing');
		expect(area?.body).toBe('VPC routing');
	});

	it("includes the author's hint when there is one", () => {
		const question = { ...makeQuestion(), hint: 'Note which option is stateless.' };
		expect(bodies(question)).toContain('Note which option is stateless.');
	});

	it('offers no hint entry when the question has none', () => {
		expect(tipsFor(makeQuestion(), 1).some((tip) => tip.label === 'Hint')).toBe(false);
	});

	it('ignores a blank hint rather than showing an empty panel', () => {
		const question = { ...makeQuestion(), hint: '   ' };
		expect(tipsFor(question, 1).some((tip) => tip.label === 'Hint')).toBe(false);
	});

	it('orders help from general technique to specific hint', () => {
		const question = { ...makeQuestion({ topic: 'S3' }), hint: 'Think about durability.' };
		expect(tipsFor(question, 1).map((tip) => tip.label)).toEqual([
			'Technique',
			'Eliminate first',
			'What this is testing',
			'Hint'
		]);
	});

	/** A hint that names the answer would defeat the point of asking for one. */
	it('never includes any option text', () => {
		const question = makeQuestion({
			correct: [0],
			optionText: { 0: 'io2 Block Express', 1: 'gp3', 2: 'st1', 3: 'sc1' }
		});
		expect(bodies(question)).not.toContain('io2 Block Express');
	});
});
