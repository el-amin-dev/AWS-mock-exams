import { describe, expect, it } from 'vitest';

import { makeAttempt, makeGradedAttempt, makeMock } from '../../../tests/factories';
import { DEFAULT_EXAM_CONFIG } from './constants';
import { buildReport } from './report';
import { scoreAttempt } from './scoring';

const config = DEFAULT_EXAM_CONFIG;

/** Grades an attempt and builds its report in one step. */
function report(total: number, correct: number, usedSeconds = 600) {
	const { mock, attempt } = makeGradedAttempt(total, correct);
	const score = scoreAttempt(mock, attempt, config, 'worst');
	return buildReport(mock, attempt, score, config, usedSeconds);
}

describe('buildReport', () => {
	it('leads with the true score, not the adjusted one', () => {
		const result = report(10, 8);
		expect(result.score.true_percent).toBe(80);
		expect(result.score.correct).toBe(8);
		expect(result.score.total).toBe(10);
	});

	it('carries the unscored range so the next mock can be tuned against it', () => {
		const result = report(10, 8);
		expect(result.score.unscored_count).toBe(2);
		expect(result.score.unscored_range).toEqual({ worst: 75, best: 100 });
	});

	it('records which strategy produced the verdict', () => {
		const result = report(10, 8);
		expect(result.score.verdict_strategy).toBe('worst');
		expect(result.score.verdict_percent).toBe(75);
		expect(result.score.passed).toBe(true);
	});

	it('translates option indices into the labels the candidate saw', () => {
		const mock = makeMock([{ correct: [2] }]);
		const attempt = makeAttempt(1, { answers: [[1]] });
		const score = scoreAttempt(mock, attempt, config, 'off');
		const result = buildReport(mock, attempt, score, config, 60);
		expect(result.questions[0]?.your_answer).toEqual(['B']);
		expect(result.questions[0]?.correct_answer).toEqual(['C']);
	});

	it('falls back to a number once option labels run past the alphabet slice', () => {
		const mock = makeMock([{ correct: [8], optionCount: 10 }]);
		const attempt = makeAttempt(1, { answers: [[9]] });
		const score = scoreAttempt(mock, attempt, config, 'off');
		const result = buildReport(mock, attempt, score, config, 60);
		expect(result.questions[0]?.correct_answer).toEqual(['9']);
		expect(result.questions[0]?.your_answer).toEqual(['10']);
	});

	it('reports pacing against the per-question budget', () => {
		const result = report(10, 8, 1200);
		expect(result.pacing.average_seconds_per_question).toBe(120);
		expect(result.pacing.budget_seconds_per_question).toBe(120);
	});

	it('flags only the questions that ran long', () => {
		const mock = makeMock([{ correct: [0] }, { correct: [0] }]);
		const attempt = makeAttempt(2, { answers: [[0], [0]], secondsOnQuestion: [45, 400] });
		const score = scoreAttempt(mock, attempt, config, 'off');
		expect(buildReport(mock, attempt, score, config, 445).pacing.slow_questions).toEqual([2]);
	});

	it('uses the mock topic list when present, and the answered topics otherwise', () => {
		const withTopics = makeMock([{ correct: [0] }], { topics_covered: ['VPC', 'S3'] });
		const attempt = makeAttempt(1, { answers: [[0]] });
		const score = scoreAttempt(withTopics, attempt, config, 'off');
		expect(buildReport(withTopics, attempt, score, config, 60).topics_covered).toEqual([
			'VPC',
			'S3'
		]);

		const withoutTopics = makeMock([{ correct: [0], topic: 'Derived' }]);
		const fallbackScore = scoreAttempt(withoutTopics, attempt, config, 'off');
		expect(buildReport(withoutTopics, attempt, fallbackScore, config, 60).topics_covered).toEqual([
			'Derived'
		]);
	});

	it('records the mode so exam and practice results are distinguishable', () => {
		const mock = makeMock([{ correct: [0] }]);
		const attempt = makeAttempt(1, { mode: 'practice', answers: [[0]] });
		const score = scoreAttempt(mock, attempt, config, 'off');
		expect(buildReport(mock, attempt, score, config, 60).mode).toBe('practice');
	});

	it('falls back to the attempt date when the mock declares none', () => {
		const mock = { questions: makeMock([{ correct: [0] }]).questions };
		const attempt = makeAttempt(1, { answers: [[0]] });
		const score = scoreAttempt(mock, attempt, config, 'off');
		const result = buildReport(mock, attempt, score, config, 60);
		expect(result.date).toBe('2026-07-25');
		expect(result.exam_id).toBe('mock');
	});

	it('names no course, provider or tool in the generator note', () => {
		const note = report(10, 8).note_to_generator.toLowerCase();
		for (const forbidden of ['claude', 'anthropic', 'gpt', 'cantrill', 'aws ']) {
			expect(note).not.toContain(forbidden);
		}
		expect(note).toContain('weak_topics');
	});

	it('survives a zero-question mock without dividing by zero', () => {
		const mock = { questions: [] };
		const attempt = makeAttempt(0);
		const score = scoreAttempt(mock, attempt, config, 'off');
		const result = buildReport(mock, attempt, score, config, 0);
		expect(result.pacing.average_seconds_per_question).toBe(0);
		expect(result.score.true_percent).toBe(0);
	});

	it('serialises to JSON without loss, since that is how it is consumed', () => {
		const result = report(10, 8);
		expect(JSON.parse(JSON.stringify(result))).toEqual(result);
	});
});
