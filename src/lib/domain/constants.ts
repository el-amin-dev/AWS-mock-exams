import type { ExamConfig, UnscoredStrategy } from './types';

/**
 * Domain constants.
 *
 * `rules.md` forbids magic numbers at call sites: every tunable is named here, and
 * anything a candidate may reasonably want to change is reachable through
 * {@link ExamConfig} rather than being baked into logic.
 */

/** Questions in a full-length SAA-C03 exam. */
export const FULL_EXAM_QUESTION_COUNT = 65;

/** Of those, the number that are unscored trial items and do not affect the result. */
export const FULL_EXAM_UNSCORED_COUNT = 15;

/**
 * Share of an exam that is unscored, applied proportionally to shorter mocks so a
 * ten-question practice run carries the same handicap as the real thing.
 */
export const UNSCORED_RATIO = FULL_EXAM_UNSCORED_COUNT / FULL_EXAM_QUESTION_COUNT;

/**
 * Multi-answer questions in a full-length exam.
 *
 * The exam guide does not publish this figure, so it is an observed approximation: roughly a
 * fifth of questions are multiple-response. It is a default, not a rule.
 */
export const FULL_EXAM_MULTI_ANSWER_COUNT = 13;

/** Share of a mock that should be multi-answer, applied proportionally to shorter mocks. */
export const MULTI_ANSWER_RATIO = FULL_EXAM_MULTI_ANSWER_COUNT / FULL_EXAM_QUESTION_COUNT;

/** Time budget per question, giving 130 minutes across a full-length exam. */
export const SECONDS_PER_QUESTION = 120;

/** Percentage of scored questions required to pass. */
export const PASS_PERCENT = 72;

/** Official SAA-C03 domain weightings, as published in the exam guide. */
export const EXAM_DOMAINS = [
	{ name: 'Secure', weight: 30 },
	{ name: 'Resilient', weight: 26 },
	{ name: 'High-Performing', weight: 24 },
	{ name: 'Cost-Optimized', weight: 20 }
] as const;

/** Default expected option counts, used when a mock does not say otherwise. */
export const SINGLE_ANSWER_OPTION_COUNT = 4;
export const MULTI_ANSWER_OPTION_COUNT = 5;

/**
 * Which unscored outcome decides pass or fail unless the candidate changes it.
 *
 * The default is the worst case, not the random draw the real exam performs. The engine
 * exists to train against the least favourable outcome the real exam could produce: if the
 * unscored items happen to fall on the questions that were answered correctly, this is the
 * result that comes back. Someone who passes on the worst case passes on every case, so a
 * pessimistic verdict is the only one that never flatters an attempt.
 *
 * This changes the verdict basis only. The true score across every question stays the
 * headline figure regardless of the strategy in force.
 */
export const DEFAULT_UNSCORED_STRATEGY: UnscoredStrategy = 'worst';

/**
 * A topic scoring below this fraction is reported as weak and carried into the next
 * mock's review questions.
 */
export const WEAK_TOPIC_THRESHOLD = 0.7;

/** Per-question time above which pacing is flagged as slow, in seconds. */
export const SLOW_QUESTION_SECONDS = 180;

/**
 * Default exam shape: the real SAA-C03 numbers.
 *
 * The engine itself is course-agnostic — it knows nothing about any syllabus — but the
 * exam it targets has a known, published shape, so these are the defaults rather than
 * neutral placeholders. Every field is overridable.
 */
export const DEFAULT_EXAM_CONFIG: ExamConfig = {
	questionCount: FULL_EXAM_QUESTION_COUNT,
	unscoredRatio: UNSCORED_RATIO,
	secondsPerQuestion: SECONDS_PER_QUESTION,
	passPercent: PASS_PERCENT,
	scale: { min: 100, max: 1000, pass: 720 },
	domains: EXAM_DOMAINS,
	singleAnswerOptionCount: SINGLE_ANSWER_OPTION_COUNT,
	multiAnswerOptionCount: MULTI_ANSWER_OPTION_COUNT
};
