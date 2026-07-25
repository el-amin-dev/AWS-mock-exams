import {
	DEFAULT_EXAM_CONFIG,
	FULL_EXAM_MULTI_ANSWER_COUNT,
	FULL_EXAM_QUESTION_COUNT,
	MULTI_ANSWER_RATIO
} from '../domain/constants';
import type { Report } from '../domain/report';
import {
	bannedPatternsSection,
	candidateSection,
	compositionSection,
	difficultySection,
	distractorTaxonomySection,
	itemWritingSection,
	outputContractSection,
	roleSection,
	scopeSection,
	selfAuditSection,
	workedExampleSection,
	type PromptOptions
} from './sections';

/**
 * Assembling the prompt.
 *
 * Section order is deliberate and follows how the instructions are actually used: who you
 * are, who it is for, what to cover, how much, how hard, how to write it, what not to do,
 * what good looks like, check your work, and finally the output shape. Rules land before the
 * example so the example reads as a demonstration rather than a new instruction, and the
 * output contract sits last so it is the freshest thing in context when generation starts.
 */

export type { Difficulty, PromptOptions } from './sections';

/**
 * Starting point: a full-length exam.
 *
 * 65 questions at the default 120 seconds each gives exactly the real 130-minute budget.
 * Roughly a fifth are multi-answer, matching how the real exam is weighted. Every one of
 * these is meant to be changed — a short daily mock scoped to one evening's topics is the
 * common case, and shortening the count shortens the clock with it.
 */
export const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
	topics: [],
	questionCount: FULL_EXAM_QUESTION_COUNT,
	multiAnswerCount: FULL_EXAM_MULTI_ANSWER_COUNT,
	difficulty: 'exam',
	config: DEFAULT_EXAM_CONFIG,
	weakTopics: [],
	reviewQuestionCount: 5
};

/**
 * How many multi-answer questions a mock of this length should carry.
 *
 * Scales the full-length exam's share proportionally, so a ten-question mock gets two rather
 * than the thirteen a full sitting would. Always a default — the count is directly editable.
 */
export function defaultMultiAnswerCount(questionCount: number): number {
	if (questionCount <= 0) return 0;
	return Math.min(questionCount, Math.round(questionCount * MULTI_ANSWER_RATIO));
}

/** Builds the complete prompt. */
export function buildPrompt(options: PromptOptions): string {
	return [
		roleSection(),
		candidateSection(),
		scopeSection(options),
		compositionSection(options),
		difficultySection(options.difficulty),
		itemWritingSection(),
		distractorTaxonomySection(),
		bannedPatternsSection(),
		workedExampleSection(),
		selfAuditSection(options),
		outputContractSection(options)
	].join('\n\n');
}

/**
 * Reads the weak topics from a previous report.
 *
 * This is the loop that makes daily mocks worth sitting: whatever went badly yesterday is
 * retested today, without the candidate having to remember or retype anything.
 */
export function weakTopicsFrom(report: Report | null): string[] {
	return report ? [...report.weak_topics] : [];
}

/**
 * Clamps prompt options to a coherent set.
 *
 * The controls are free-text number inputs, so a candidate can easily ask for more
 * multi-answer questions than there are questions. Rather than emit a self-contradictory
 * prompt, correct it here — silently generating an impossible instruction wastes a whole
 * generation round-trip.
 */
export function normalisePromptOptions(options: PromptOptions): PromptOptions {
	const questionCount = Math.max(1, Math.min(200, Math.round(options.questionCount || 1)));
	const multiAnswerCount = Math.max(
		0,
		Math.min(questionCount, Math.round(options.multiAnswerCount || 0))
	);
	const reviewQuestionCount =
		options.weakTopics.length === 0
			? 0
			: Math.max(0, Math.min(questionCount, Math.round(options.reviewQuestionCount || 0)));

	return { ...options, questionCount, multiAnswerCount, reviewQuestionCount };
}
