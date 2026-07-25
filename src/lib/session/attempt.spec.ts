import { describe, expect, it } from 'vitest';

import { makeMock, makeQuestion } from '../../../tests/factories';
import {
	checkQuestion,
	countUnanswered,
	createAttempt,
	isAnswered,
	prepareMock,
	recordTime,
	selectOption,
	toggleFlag,
	toggleStrike
} from './attempt';

const START = '2026-07-25T09:00:00.000Z';

/** A fresh five-question exam attempt. */
function fresh(count = 5) {
	return createAttempt(count, 'exam', START, 1234);
}

describe('createAttempt', () => {
	it('sizes every field to the question count', () => {
		const attempt = fresh(3);
		expect(attempt.answers).toHaveLength(3);
		expect(attempt.flags).toEqual([false, false, false]);
		expect(attempt.struck).toEqual([[], [], []]);
		expect(attempt.secondsOnQuestion).toEqual([0, 0, 0]);
		expect(attempt.checked).toEqual([false, false, false]);
	});

	it('does not share array references between questions', () => {
		const attempt = selectOption(fresh(3), 0, 1, 1);
		expect(attempt.answers[1]).toEqual([]);
	});
});

describe('selectOption — single answer', () => {
	it('replaces the previous choice', () => {
		let attempt = selectOption(fresh(), 0, 2, 1);
		attempt = selectOption(attempt, 0, 3, 1);
		expect(attempt.answers[0]).toEqual([3]);
	});

	it('leaves other questions untouched', () => {
		const attempt = selectOption(fresh(), 1, 2, 1);
		expect(attempt.answers[0]).toEqual([]);
		expect(attempt.answers[1]).toEqual([2]);
	});

	it('does not mutate the attempt it was given', () => {
		const original = fresh();
		selectOption(original, 0, 1, 1);
		expect(original.answers[0]).toEqual([]);
	});
});

describe('selectOption — multiple answers', () => {
	it('accumulates up to the limit', () => {
		let attempt = selectOption(fresh(), 0, 1, 2);
		attempt = selectOption(attempt, 0, 3, 2);
		expect(attempt.answers[0]).toEqual([1, 3]);
	});

	it('toggles a selected option off', () => {
		let attempt = selectOption(fresh(), 0, 1, 2);
		attempt = selectOption(attempt, 0, 1, 2);
		expect(attempt.answers[0]).toEqual([]);
	});

	/** A click must always visibly do something, rather than being silently rejected. */
	it('drops the oldest choice once the limit is exceeded', () => {
		let attempt = selectOption(fresh(), 0, 1, 2);
		attempt = selectOption(attempt, 0, 2, 2);
		attempt = selectOption(attempt, 0, 3, 2);
		expect(attempt.answers[0]).toEqual([2, 3]);
	});

	it('supports a three-answer question', () => {
		let attempt = fresh();
		for (const option of [0, 1, 2]) attempt = selectOption(attempt, 0, option, 3);
		expect(attempt.answers[0]).toEqual([0, 1, 2]);
	});
});

describe('toggleStrike', () => {
	it('strikes and unstrikes', () => {
		let attempt = toggleStrike(fresh(), 0, 2);
		expect(attempt.struck[0]).toEqual([2]);
		attempt = toggleStrike(attempt, 0, 2);
		expect(attempt.struck[0]).toEqual([]);
	});

	it('deselects an option as it is struck, so the two never contradict', () => {
		let attempt = selectOption(fresh(), 0, 2, 1);
		attempt = toggleStrike(attempt, 0, 2);
		expect(attempt.answers[0]).toEqual([]);
		expect(attempt.struck[0]).toEqual([2]);
	});

	it('refuses to select a struck option', () => {
		let attempt = toggleStrike(fresh(), 0, 2);
		attempt = selectOption(attempt, 0, 2, 1);
		expect(attempt.answers[0]).toEqual([]);
	});

	it('allows selection again once unstruck', () => {
		let attempt = toggleStrike(fresh(), 0, 2);
		attempt = toggleStrike(attempt, 0, 2);
		attempt = selectOption(attempt, 0, 2, 1);
		expect(attempt.answers[0]).toEqual([2]);
	});
});

describe('toggleFlag and checkQuestion', () => {
	it('flags and unflags', () => {
		let attempt = toggleFlag(fresh(), 3);
		expect(attempt.flags[3]).toBe(true);
		attempt = toggleFlag(attempt, 3);
		expect(attempt.flags[3]).toBe(false);
	});

	it('marks a question checked, and does not undo it', () => {
		let attempt = checkQuestion(fresh(), 1);
		expect(attempt.checked[1]).toBe(true);
		attempt = checkQuestion(attempt, 1);
		expect(attempt.checked[1]).toBe(true);
	});
});

describe('recordTime', () => {
	it('accumulates across visits to the same question', () => {
		let attempt = recordTime(fresh(), 0, 30);
		attempt = recordTime(attempt, 0, 15);
		expect(attempt.secondsOnQuestion[0]).toBe(45);
	});

	it('rounds fractional seconds', () => {
		expect(recordTime(fresh(), 0, 1.6).secondsOnQuestion[0]).toBe(2);
	});

	it('ignores a negative interval from a clock adjustment', () => {
		expect(recordTime(fresh(), 0, -20).secondsOnQuestion[0]).toBe(0);
	});
});

describe('isAnswered', () => {
	it('treats a complete single answer as answered', () => {
		expect(isAnswered(selectOption(fresh(), 0, 1, 1), 0, 1)).toBe(true);
	});

	it('treats an untouched question as unanswered', () => {
		expect(isAnswered(fresh(), 0, 1)).toBe(false);
	});

	/** Half of a "Select TWO" scores zero, so it must not read as done. */
	it('treats a partially answered multi-answer question as unanswered', () => {
		expect(isAnswered(selectOption(fresh(), 0, 1, 2), 0, 2)).toBe(false);
	});

	it('counts the outstanding questions across a mock', () => {
		const mock = makeMock([{ correct: [0] }, { correct: [0, 1] }, { correct: [0] }]);
		let attempt = createAttempt(3, 'exam', START, 1);
		attempt = selectOption(attempt, 0, 0, 1);
		attempt = selectOption(attempt, 1, 0, 2);
		expect(countUnanswered(attempt, mock.questions)).toBe(2);
	});
});

describe('prepareMock', () => {
	const mock = makeMock(
		Array.from({ length: 8 }, (_, i) => ({ stem: `Question ${i}`, correct: [0] }))
	);

	it('presents every question exactly once', () => {
		const prepared = prepareMock(mock, 99);
		expect(prepared.questions).toHaveLength(8);
		expect([...prepared.sourceIndexes].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it('is reproducible from the seed, so a resumed attempt looks identical', () => {
		expect(prepareMock(mock, 7).sourceIndexes).toEqual(prepareMock(mock, 7).sourceIndexes);
	});

	it('orders differently for a different seed', () => {
		const orders = [1, 2, 3, 4, 5].map((seed) => prepareMock(mock, seed).sourceIndexes.join());
		expect(new Set(orders).size).toBeGreaterThan(1);
	});

	it('honours randomize_questions: false', () => {
		const fixed = makeMock(
			Array.from({ length: 8 }, (_, i) => ({ stem: `Q${i}`, correct: [0] })),
			{ config: { randomize_questions: false } }
		);
		expect(prepareMock(fixed, 5).sourceIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it('honours randomize_options: false', () => {
		const fixed = makeMock([{ correct: [0], optionText: { 0: 'first', 1: 'second' } }], {
			config: { randomize_options: false }
		});
		expect(prepareMock(fixed, 5).questions[0]?.options[0]?.text).toBe('first');
	});

	it('keeps each option list matched to its own question', () => {
		const distinct = makeMock([
			{ stem: 'alpha', correct: [0], optionText: { 0: 'a0', 1: 'a1', 2: 'a2', 3: 'a3' } },
			{ stem: 'beta', correct: [0], optionText: { 0: 'b0', 1: 'b1', 2: 'b2', 3: 'b3' } }
		]);
		for (const question of prepareMock(distinct, 3).questions) {
			const prefix = question.stem === 'alpha' ? 'a' : 'b';
			expect(question.options.every((option) => option.text.startsWith(prefix))).toBe(true);
		}
	});

	it('preserves which option is correct through shuffling', () => {
		const marked = makeQuestion({ correct: [2], optionText: { 2: 'the right one' } });
		const prepared = prepareMock({ questions: [marked] }, 42);
		const correct = prepared.questions[0]?.options.filter((option) => option.correct);
		expect(correct).toHaveLength(1);
		expect(correct?.[0]?.text).toBe('the right one');
	});
});

/**
 * Every accessor falls back when an array is shorter than the question count.
 *
 * This is not hypothetical: a resume restores whatever was persisted, and a write
 * interrupted mid-save — or a hand-edited record — can leave the parallel arrays ragged.
 * The rules must degrade to "nothing recorded" rather than throw partway through an exam.
 */
describe('a ragged attempt degrades instead of throwing', () => {
	/** An attempt sized for five questions whose arrays only cover the first. */
	function ragged() {
		return {
			...createAttempt(5, 'exam', START, 7),
			answers: [[1]],
			flags: [true],
			struck: [[2]],
			secondsOnQuestion: [10],
			checked: [true]
		};
	}

	it('selects on a question beyond the recorded answers', () => {
		expect(selectOption(ragged(), 4, 3, 1).answers[4]).toEqual([3]);
	});

	it('toggles a selection off beyond the recorded answers', () => {
		const attempt = selectOption(selectOption(ragged(), 4, 3, 2), 4, 3, 2);
		expect(attempt.answers[4]).toEqual([]);
	});

	it('strikes on a question beyond the recorded strikes', () => {
		expect(toggleStrike(ragged(), 4, 1).struck[4]).toEqual([1]);
	});

	it('unstrikes a recorded strike', () => {
		expect(toggleStrike(ragged(), 0, 2).struck[0]).toEqual([]);
	});

	it('flags a question beyond the recorded flags', () => {
		expect(toggleFlag(ragged(), 4).flags[4]).toBe(true);
	});

	it('records time on a question with no recorded time', () => {
		expect(recordTime(ragged(), 4, 12).secondsOnQuestion[4]).toBe(12);
	});

	it('treats a question beyond the recorded answers as unanswered', () => {
		expect(isAnswered(ragged(), 4, 1)).toBe(false);
	});

	it('marks a question checked beyond the recorded flags', () => {
		expect(checkQuestion(ragged(), 4).checked[4]).toBe(true);
	});
});
