import { createRandom, createSeed, shuffle } from '../domain/random';
import type { Attempt, ExamMode, Mock, Question } from '../domain/types';

/**
 * Attempt transitions.
 *
 * Every function here is pure: it takes an attempt and returns a new one. Reactivity, the
 * clock, and storage all live outside this module, which keeps the rules of the exam
 * testable without rendering anything.
 */

/** A mock whose questions and options have been placed in presentation order. */
export interface PreparedMock {
	readonly mock: Mock;
	/** Questions in the order the candidate will see them. */
	readonly questions: readonly Question[];
	/** For each presented question, its index in the original mock. */
	readonly sourceIndexes: readonly number[];
}

/**
 * Places a mock into presentation order.
 *
 * Ordering is derived from the seed, so a resumed attempt presents identically. The mock's
 * own `randomize_*` flags opt out; both default to on, matching the real exam.
 */
export function prepareMock(mock: Mock, seed: number): PreparedMock {
	const random = createRandom(seed);
	const shuffleOptions = mock.config?.randomize_options !== false;
	const shuffleQuestions = mock.config?.randomize_questions !== false;

	const withOptions = mock.questions.map((question, index) => ({
		question: shuffleOptions
			? { ...question, options: shuffle(question.options, random) }
			: question,
		index
	}));
	const ordered = shuffleQuestions ? shuffle(withOptions, random) : withOptions;

	return {
		mock,
		questions: ordered.map((entry) => entry.question),
		sourceIndexes: ordered.map((entry) => entry.index)
	};
}

/** Starts a fresh attempt sized for `questionCount` questions. */
export function createAttempt(
	questionCount: number,
	mode: ExamMode,
	startedAt: string,
	seed: number = createSeed()
): Attempt {
	const blank = <T>(value: () => T): T[] => Array.from({ length: questionCount }, value);
	return {
		mode,
		startedAt,
		seed,
		answers: blank<number[]>(() => []),
		flags: blank(() => false),
		struck: blank<number[]>(() => []),
		secondsOnQuestion: blank(() => 0),
		checked: blank(() => false)
	};
}

/** Replaces one entry of an array field without mutating the original. */
function replace<T>(items: readonly T[], index: number, value: T): T[] {
	const next = [...items];
	next[index] = value;
	return next;
}

/**
 * Applies a selection to a question.
 *
 * Single-answer questions replace the selection. Multi-answer questions toggle, and once
 * `maxSelections` is reached the oldest choice is dropped so a further click always has a
 * visible effect rather than silently doing nothing.
 *
 * Selecting a struck-out option is ignored: striking is an elimination aid, and treating a
 * click on eliminated text as an answer is never what was meant.
 */
export function selectOption(
	attempt: Attempt,
	questionIndex: number,
	optionIndex: number,
	maxSelections: number
): Attempt {
	const current = attempt.answers[questionIndex] ?? [];
	if ((attempt.struck[questionIndex] ?? []).includes(optionIndex)) return attempt;

	let next: number[];
	if (maxSelections <= 1) {
		next = [optionIndex];
	} else if (current.includes(optionIndex)) {
		next = current.filter((index) => index !== optionIndex);
	} else {
		next = [...current, optionIndex];
		if (next.length > maxSelections) next = next.slice(next.length - maxSelections);
	}
	return { ...attempt, answers: replace(attempt.answers, questionIndex, next) };
}

/**
 * Strikes or unstrikes an option.
 *
 * Striking an option that is currently selected also deselects it, so the two states can
 * never contradict each other.
 */
export function toggleStrike(
	attempt: Attempt,
	questionIndex: number,
	optionIndex: number
): Attempt {
	const current = attempt.struck[questionIndex] ?? [];
	const striking = !current.includes(optionIndex);
	const nextStruck = striking
		? [...current, optionIndex]
		: current.filter((index) => index !== optionIndex);
	const answers = striking
		? replace(
				attempt.answers,
				questionIndex,
				(attempt.answers[questionIndex] ?? []).filter((index) => index !== optionIndex)
			)
		: attempt.answers;
	return { ...attempt, answers, struck: replace(attempt.struck, questionIndex, nextStruck) };
}

/** Flags or unflags a question for review. */
export function toggleFlag(attempt: Attempt, questionIndex: number): Attempt {
	return {
		...attempt,
		flags: replace(attempt.flags, questionIndex, !(attempt.flags[questionIndex] ?? false))
	};
}

/** Marks a question as graded and revealed. Practice mode only; never reversible. */
export function checkQuestion(attempt: Attempt, questionIndex: number): Attempt {
	return { ...attempt, checked: replace(attempt.checked, questionIndex, true) };
}

/** Adds elapsed seconds to a question's running total. */
export function recordTime(attempt: Attempt, questionIndex: number, seconds: number): Attempt {
	const current = attempt.secondsOnQuestion[questionIndex] ?? 0;
	return {
		...attempt,
		secondsOnQuestion: replace(
			attempt.secondsOnQuestion,
			questionIndex,
			current + Math.max(0, Math.round(seconds))
		)
	};
}

/**
 * Whether a question counts as answered.
 *
 * A multi-answer question with only one of its two selections made is deliberately *not*
 * answered: it would score zero, and the review screen must show it as outstanding rather
 * than lull the candidate into thinking it is done.
 */
export function isAnswered(attempt: Attempt, questionIndex: number, required: number): boolean {
	const selected = attempt.answers[questionIndex] ?? [];
	return selected.length > 0 && selected.length === required;
}

/** Counts questions still outstanding, for the pre-submission warning. */
export function countUnanswered(attempt: Attempt, questions: readonly Question[]): number {
	return questions.filter(
		(question, index) =>
			!isAnswered(attempt, index, question.options.filter((option) => option.correct).length)
	).length;
}
