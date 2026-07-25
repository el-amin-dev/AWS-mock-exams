import type { Attempt, ExamMode, Mock, Option, Question } from '../src/lib/domain/types';

/**
 * Test factories.
 *
 * Specs should state only what they are actually testing, so these supply everything else.
 * Keeping them here rather than in `src/` keeps fixture code out of the coverage report.
 */

/** Builds an option; `text` defaults to a length that will not trip the length heuristic. */
export function makeOption(overrides: Partial<Option> = {}): Option {
	return {
		text: 'An option of unremarkable length',
		correct: false,
		why: 'Wrong — it does not address the scenario.',
		...overrides
	};
}

export interface QuestionSpec {
	/** Indices of the options that are correct. */
	readonly correct?: readonly number[];
	readonly optionCount?: number;
	readonly topic?: string;
	readonly domain?: string;
	readonly stem?: string;
	/** Overrides the text of specific options, keyed by index. */
	readonly optionText?: Readonly<Record<number, string>>;
}

/** Builds a question with the requested shape. Defaults to single-answer, four options. */
export function makeQuestion(spec: QuestionSpec = {}): Question {
	const correct = spec.correct ?? [0];
	const optionCount = spec.optionCount ?? (correct.length > 1 ? 5 : 4);
	const options = Array.from({ length: optionCount }, (_, index) =>
		makeOption({
			correct: correct.includes(index),
			...(spec.optionText?.[index] === undefined ? {} : { text: spec.optionText[index] as string })
		})
	);
	return {
		topic: spec.topic ?? 'Topic',
		...(spec.domain === undefined ? {} : { domain: spec.domain }),
		stem: spec.stem ?? 'A scenario that contains every fact needed to answer it.',
		options
	};
}

/** Builds a mock from question specs. */
export function makeMock(specs: readonly QuestionSpec[], overrides: Partial<Mock> = {}): Mock {
	return {
		exam_id: 'test-mock',
		date: '2026-07-25',
		title: 'Test Mock',
		config: { seconds_per_question: 120, pass_percent: 72 },
		questions: specs.map(makeQuestion),
		...overrides
	};
}

/**
 * Builds a mock of `total` questions in which the first `correct` are answered correctly
 * and the rest are answered wrongly, together with a matching attempt.
 *
 * Most scoring cases care only about how many answers were right, so this removes the
 * per-question detail that would otherwise obscure the arithmetic under test.
 */
export function makeGradedAttempt(
	total: number,
	correct: number,
	overrides: Partial<Attempt> = {}
): { mock: Mock; attempt: Attempt } {
	const mock = makeMock(Array.from({ length: total }, (_, i) => ({ topic: `Topic ${i + 1}` })));
	const answers = Array.from({ length: total }, (_, index) => (index < correct ? [0] : [1]));
	return { mock, attempt: makeAttempt(total, { answers, ...overrides }) };
}

/** Builds an attempt sized for `total` questions, with every field defaulted. */
export function makeAttempt(total: number, overrides: Partial<Attempt> = {}): Attempt {
	const mode: ExamMode = 'exam';
	return {
		mode,
		startedAt: '2026-07-25T09:00:00.000Z',
		seed: 12345,
		answers: Array.from({ length: total }, () => []),
		flags: Array.from({ length: total }, () => false),
		struck: Array.from({ length: total }, () => []),
		secondsOnQuestion: Array.from({ length: total }, () => 60),
		checked: Array.from({ length: total }, () => false),
		...overrides
	};
}
