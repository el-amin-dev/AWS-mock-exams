import { describe, expect, it } from 'vitest';

import { makeAttempt, makeGradedAttempt, makeMock, makeQuestion } from '../../../tests/factories';
import { DEFAULT_EXAM_CONFIG, UNSCORED_RATIO } from './constants';
import {
	correctOptionIndexes,
	isAnswerCorrect,
	scaledScore,
	scoreAttempt,
	unscoredCount
} from './scoring';
import type { ExamConfig, UnscoredStrategy } from './types';

const config = DEFAULT_EXAM_CONFIG;

/** Grades an attempt of `total` questions with `correct` right answers. */
function score(total: number, correct: number, strategy: UnscoredStrategy = 'off') {
	const { mock, attempt } = makeGradedAttempt(total, correct);
	return scoreAttempt(mock, attempt, config, strategy);
}

describe('unscoredCount', () => {
	it('reproduces the real exam: 15 of 65', () => {
		expect(unscoredCount(65, UNSCORED_RATIO)).toBe(15);
	});

	it('applies the same share proportionally to a shorter mock', () => {
		expect(unscoredCount(10, UNSCORED_RATIO)).toBe(2);
		expect(unscoredCount(20, UNSCORED_RATIO)).toBe(5);
	});

	it('rounds down to zero when a mock is too short to carry an unscored question', () => {
		expect(unscoredCount(2, UNSCORED_RATIO)).toBe(0);
		expect(unscoredCount(1, UNSCORED_RATIO)).toBe(0);
		expect(unscoredCount(0, UNSCORED_RATIO)).toBe(0);
	});

	it('always leaves at least one question scored, however extreme the ratio', () => {
		expect(unscoredCount(10, 1)).toBe(9);
		expect(unscoredCount(10, 5)).toBe(9);
		expect(unscoredCount(2, 1)).toBe(1);
	});

	it('never returns a negative count for a nonsensical ratio', () => {
		expect(unscoredCount(10, -1)).toBe(0);
	});
});

describe('isAnswerCorrect', () => {
	it('accepts the single correct option', () => {
		expect(isAnswerCorrect(makeQuestion({ correct: [2] }), [2])).toBe(true);
	});

	it('rejects a wrong single answer', () => {
		expect(isAnswerCorrect(makeQuestion({ correct: [2] }), [1])).toBe(false);
	});

	it('accepts a multi-answer question only when the selection matches exactly', () => {
		const question = makeQuestion({ correct: [1, 3] });
		expect(isAnswerCorrect(question, [1, 3])).toBe(true);
		expect(isAnswerCorrect(question, [3, 1])).toBe(true);
	});

	it('awards no partial credit for a subset', () => {
		expect(isAnswerCorrect(makeQuestion({ correct: [1, 3] }), [1])).toBe(false);
	});

	it('awards no credit when an extra option is selected', () => {
		expect(isAnswerCorrect(makeQuestion({ correct: [1, 3] }), [1, 2, 3])).toBe(false);
	});

	it('treats a blank answer as wrong', () => {
		expect(isAnswerCorrect(makeQuestion({ correct: [0] }), [])).toBe(false);
	});

	it('reports the indices of the correct options', () => {
		expect(correctOptionIndexes(makeQuestion({ correct: [0, 4], optionCount: 5 }))).toEqual([0, 4]);
	});
});

describe('scoreAttempt — the unscored range', () => {
	it('reports the true score across every question as the headline', () => {
		const result = score(10, 8);
		expect(result.raw).toEqual({ correct: 8, total: 10, percent: 80 });
		expect(result.unscoredCount).toBe(2);
	});

	it('discards correct answers first for the worst case', () => {
		// 8 of 10 correct, 2 unscored: the two discarded were both right, so 6 of 8 remain.
		expect(score(10, 8).worst).toEqual({ correct: 6, total: 8, percent: 75 });
	});

	it('discards wrong answers first for the best case', () => {
		// Both wrong answers are absorbed by the unscored slots, leaving 8 of 8.
		expect(score(10, 8).best).toEqual({ correct: 8, total: 8, percent: 100 });
	});

	it('spills into correct answers once the wrong ones run out', () => {
		// 9 correct, 1 wrong, 2 unscored: one slot absorbs the wrong answer, the other must
		// take a correct one.
		expect(score(10, 9).best).toEqual({ correct: 8, total: 8, percent: 100 });
	});

	it('floors the worst case at zero when unscored slots exceed correct answers', () => {
		expect(score(10, 1).worst).toEqual({ correct: 0, total: 8, percent: 0 });
	});

	it('keeps a perfect attempt perfect at both bounds', () => {
		const result = score(10, 10);
		expect(result.raw.percent).toBe(100);
		expect(result.worst.percent).toBe(100);
		expect(result.best.percent).toBe(100);
	});

	it('keeps a wholly unanswered attempt at zero at both bounds', () => {
		const { mock } = makeGradedAttempt(10, 0);
		const result = scoreAttempt(mock, makeAttempt(10), config, 'off');
		expect(result.raw.percent).toBe(0);
		expect(result.worst.percent).toBe(0);
		expect(result.best.percent).toBe(0);
	});

	/**
	 * Holds for every possible number of correct answers, not just a sampled few. The worst
	 * case can never exceed the true score: discarding correct answers from a pool that
	 * shrinks by the same amount always loses ground.
	 */
	it('always orders the bounds worst <= true <= best', () => {
		for (let correct = 0; correct <= 10; correct++) {
			const result = score(10, correct);
			expect(result.worst.percent).toBeLessThanOrEqual(result.raw.percent);
			expect(result.raw.percent).toBeLessThanOrEqual(result.best.percent);
		}
	});

	it('never divides by an empty scored pool', () => {
		const result = score(2, 1);
		expect(result.worst.total).toBeGreaterThan(0);
		expect(Number.isNaN(result.worst.percent)).toBe(false);
	});

	it('leaves the score untouched when the mock is too short to have unscored questions', () => {
		const result = score(2, 1);
		expect(result.unscoredCount).toBe(0);
		expect(result.worst).toEqual(result.raw);
		expect(result.best).toEqual(result.raw);
	});
});

describe('scoreAttempt — the random draw', () => {
	it('is reproducible from the attempt seed', () => {
		const { mock, attempt } = makeGradedAttempt(20, 14);
		const first = scoreAttempt(mock, attempt, config, 'random');
		const second = scoreAttempt(mock, attempt, config, 'random');
		expect(first.random).toEqual(second.random);
	});

	it('changes with the seed, so it is a genuine draw', () => {
		const { mock } = makeGradedAttempt(20, 14);
		const answers = Array.from({ length: 20 }, (_, i) => (i < 14 ? [0] : [1]));
		const draws = [1, 2, 3, 4, 5, 6].map(
			(seed) =>
				scoreAttempt(mock, makeAttempt(20, { answers, seed }), config, 'random').random.correct
		);
		expect(new Set(draws).size).toBeGreaterThan(1);
	});

	it('lands between the worst and best bounds', () => {
		const { mock } = makeGradedAttempt(20, 14);
		const answers = Array.from({ length: 20 }, (_, i) => (i < 14 ? [0] : [1]));
		for (let seed = 1; seed <= 20; seed++) {
			const result = scoreAttempt(mock, makeAttempt(20, { answers, seed }), config, 'random');
			expect(result.random.percent).toBeGreaterThanOrEqual(result.worst.percent);
			expect(result.random.percent).toBeLessThanOrEqual(result.best.percent);
		}
	});

	it('marks exactly the drawn questions as unscored', () => {
		const result = score(20, 14, 'random');
		expect(result.questions.filter((question) => question.unscored)).toHaveLength(
			result.unscoredCount
		);
	});

	it('marks nothing as unscored under any other strategy', () => {
		for (const strategy of ['off', 'worst', 'best'] as const) {
			expect(score(20, 14, strategy).questions.some((question) => question.unscored)).toBe(false);
		}
	});
});

describe('scoreAttempt — the verdict', () => {
	it('judges on the true score when the mechanic is switched off', () => {
		const result = score(10, 8, 'off');
		expect(result.verdict.percent).toBe(result.raw.percent);
		expect(result.verdict.passed).toBe(true);
	});

	it('judges on the worst case when asked to', () => {
		const result = score(10, 8, 'worst');
		expect(result.verdict.percent).toBe(75);
		expect(result.verdict.strategy).toBe('worst');
	});

	it('judges on the best case when asked to', () => {
		expect(score(10, 8, 'best').verdict.percent).toBe(100);
	});

	it('can fail an attempt that the true score would have passed', () => {
		// 8 of 10 is 80% and passes; the worst case is 75% and also passes, but 7 of 10 is
		// 70% (fails) while its worst case is 62% — the gap the candidate must train for.
		const lenient = score(10, 8, 'off');
		const strict = score(10, 8, 'worst');
		expect(lenient.verdict.passed).toBe(true);
		expect(strict.verdict.percent).toBeLessThan(lenient.verdict.percent);
	});
});

describe('scaledScore', () => {
	const scale = config.scale;

	it('maps the pass mark exactly onto the pass score', () => {
		expect(scaledScore(72, 72, scale)).toBe(720);
	});

	it('maps the extremes onto the ends of the range', () => {
		expect(scaledScore(100, 72, scale)).toBe(1000);
		expect(scaledScore(0, 72, scale)).toBe(100);
	});

	it('never reports outside the range', () => {
		expect(scaledScore(150, 72, scale)).toBe(1000);
		expect(scaledScore(-20, 72, scale)).toBe(100);
	});

	it('increases monotonically', () => {
		let previous = -1;
		for (let percent = 0; percent <= 100; percent++) {
			const value = scaledScore(percent, 72, scale);
			expect(value).toBeGreaterThanOrEqual(previous);
			previous = value;
		}
	});

	it('survives a pass mark of 100 without dividing by zero', () => {
		expect(Number.isFinite(scaledScore(50, 100, scale))).toBe(true);
	});
});

describe('scoreAttempt — breakdowns', () => {
	it('aggregates by topic', () => {
		const mock = makeMock([
			{ topic: 'VPC', correct: [0] },
			{ topic: 'VPC', correct: [0] },
			{ topic: 'S3', correct: [0] }
		]);
		const attempt = makeAttempt(3, { answers: [[0], [1], [0]] });
		const byTopic = scoreAttempt(mock, attempt, config, 'off').byTopic;
		expect(byTopic).toContainEqual({ name: 'VPC', correct: 1, total: 2, percent: 50 });
		expect(byTopic).toContainEqual({ name: 'S3', correct: 1, total: 1, percent: 100 });
	});

	it('attaches the official weight to a recognised domain', () => {
		const mock = makeMock([{ domain: 'Secure', correct: [0] }]);
		const [domain] = scoreAttempt(mock, makeAttempt(1, { answers: [[0]] }), config, 'off').byDomain;
		expect(domain).toMatchObject({ name: 'Secure', weight: 30 });
	});

	it('groups unlabelled questions rather than dropping them', () => {
		const mock = makeMock([{ correct: [0] }]);
		const [domain] = scoreAttempt(mock, makeAttempt(1, { answers: [[0]] }), config, 'off').byDomain;
		expect(domain?.name).toBe('(unlabelled)');
		expect(domain?.weight).toBeUndefined();
	});

	it('reports a topic as weak below the threshold and not at or above it', () => {
		const mock = makeMock([
			{ topic: 'Weak', correct: [0] },
			{ topic: 'Weak', correct: [0] },
			{ topic: 'Strong', correct: [0] }
		]);
		const attempt = makeAttempt(3, { answers: [[0], [1], [0]] });
		const result = scoreAttempt(mock, attempt, config, 'off');
		expect(result.weakTopics).toContain('Weak');
		expect(result.weakTopics).not.toContain('Strong');
	});

	it('classifies each question as correct, wrong or blank', () => {
		const mock = makeMock([{ correct: [0] }, { correct: [0] }, { correct: [0] }]);
		const attempt = makeAttempt(3, { answers: [[0], [1], []] });
		const outcomes = scoreAttempt(mock, attempt, config, 'off').questions.map((q) => q.outcome);
		expect(outcomes).toEqual(['correct', 'wrong', 'blank']);
	});

	it('labels multi-answer questions by their correct-option count', () => {
		const mock = makeMock([{ correct: [0, 1] }, { correct: [0] }]);
		const types = scoreAttempt(mock, makeAttempt(2), config, 'off').questions.map((q) => q.type);
		expect(types).toEqual(['multi', 'single']);
	});

	it('tolerates an attempt shorter than the mock rather than throwing', () => {
		const mock = makeMock([{ correct: [0] }, { correct: [0] }]);
		const truncated = { ...makeAttempt(2), answers: [[0]] };
		const result = scoreAttempt(mock, truncated, config, 'off');
		expect(result.raw).toEqual({ correct: 1, total: 2, percent: 50 });
		expect(result.questions[1]?.outcome).toBe('blank');
	});

	/** A resumed attempt saved mid-question can have shorter timing and flag arrays. */
	it('defaults missing timing and flag entries instead of reporting undefined', () => {
		const mock = makeMock([{ correct: [0] }, { correct: [0] }]);
		const partial = { ...makeAttempt(2), secondsOnQuestion: [30], flags: [true] };
		const result = scoreAttempt(mock, partial, config, 'off');
		expect(result.questions[1]?.secondsSpent).toBe(0);
		expect(result.questions[1]?.flagged).toBe(false);
		expect(result.questions[0]?.flagged).toBe(true);
	});
});

describe('scoreAttempt — configurability', () => {
	it('honours a different unscored ratio', () => {
		const halved: ExamConfig = { ...config, unscoredRatio: 0.5 };
		const { mock, attempt } = makeGradedAttempt(10, 8);
		expect(scoreAttempt(mock, attempt, halved, 'off').unscoredCount).toBe(5);
	});

	it('honours a different pass mark', () => {
		const strict: ExamConfig = { ...config, passPercent: 90 };
		const { mock, attempt } = makeGradedAttempt(10, 8);
		expect(scoreAttempt(mock, attempt, strict, 'off').verdict.passed).toBe(false);
	});
});
