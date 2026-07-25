import type { ExamConfig, Mock, Option, Question } from './types';

/**
 * Validation of generated mock JSON.
 *
 * A mock arrives from outside the application — a file, a paste, or a generator's output —
 * and is untrusted until checked here. `rules.md` requires validation at every boundary,
 * and this is the only one the engine has.
 *
 * Issues are split in two, because they serve different purposes:
 *
 * - **Errors** mean the engine cannot present the mock. They block starting.
 * - **Warnings** mean the mock is usable but the *question writing* is suspect. They are
 *   the more valuable half: a question whose correct option is visibly the longest is
 *   answerable without knowing the subject, which quietly inflates every future score.
 */

/** A single problem, located by a human-readable path such as `Q3 option B`. */
export interface ValidationIssue {
	readonly path: string;
	readonly message: string;
}

/** The outcome of validating one candidate mock. */
export interface ValidationResult {
	readonly valid: boolean;
	readonly errors: readonly ValidationIssue[];
	readonly warnings: readonly ValidationIssue[];
	readonly questionCount: number;
	/** The validated mock, or `null` when any error was raised. */
	readonly mock: Mock | null;
}

/** Option labels, matching how options are presented to the candidate. */
export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Smallest number of options that can constitute a meaningful question. */
const MINIMUM_OPTIONS = 2;

/** Correct-option counts beyond this are almost always a generation mistake. */
const MAXIMUM_SENSIBLE_CORRECT = 3;

function label(index: number): string {
	return OPTION_LABELS[index] ?? String(index + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/** Collects issues while validating; keeps the checks below free of bookkeeping. */
class IssueLog {
	readonly errors: ValidationIssue[] = [];
	readonly warnings: ValidationIssue[] = [];

	error(path: string, message: string): void {
		this.errors.push({ path, message });
	}

	warn(path: string, message: string): void {
		this.warnings.push({ path, message });
	}
}

/** Validates one option, returning it when structurally sound. */
function validateOption(raw: unknown, path: string, log: IssueLog): Option | null {
	if (!isRecord(raw)) {
		log.error(path, 'Not an object.');
		return null;
	}
	let sound = true;
	if (!isNonEmptyString(raw.text)) {
		log.error(path, 'Missing or empty "text".');
		sound = false;
	}
	if (typeof raw.correct !== 'boolean') {
		log.error(path, '"correct" must be true or false.');
		sound = false;
	}
	if (!isNonEmptyString(raw.why)) {
		log.error(path, 'Missing "why" — every option must explain itself.');
		sound = false;
	}
	if (!sound) return null;
	return { text: raw.text as string, correct: raw.correct as boolean, why: raw.why as string };
}

/**
 * Flags a question whose correct option is strictly the longest.
 *
 * Length is the single most reliable tell in generated exam items: a model that has
 * reasoned its way to the right answer tends to justify it at greater length than the
 * distractors it invented.
 */
function checkOptionLengths(options: readonly Option[], path: string, log: IssueLog): void {
	const correctLengths = options.filter((o) => o.correct).map((o) => o.text.length);
	const wrongLengths = options.filter((o) => !o.correct).map((o) => o.text.length);
	if (correctLengths.length === 0 || wrongLengths.length === 0) return;
	if (Math.min(...correctLengths) > Math.max(...wrongLengths)) {
		log.warn(path, 'The correct option is the longest — a likely giveaway.');
	}
}

/** Validates one question, returning it when structurally sound. */
function validateQuestion(
	raw: unknown,
	path: string,
	config: ExamConfig,
	log: IssueLog
): Question | null {
	if (!isRecord(raw)) {
		log.error(path, 'Not an object.');
		return null;
	}
	if (!isNonEmptyString(raw.stem)) {
		log.error(path, 'Missing or empty "stem".');
	}
	if (!Array.isArray(raw.options) || raw.options.length < MINIMUM_OPTIONS) {
		log.error(path, `Needs an "options" array of at least ${MINIMUM_OPTIONS} entries.`);
		return null;
	}
	if (!isNonEmptyString(raw.topic)) {
		log.warn(path, 'No "topic" — this question cannot contribute to weak-topic detection.');
	}

	const options = raw.options.map((option, index) =>
		validateOption(option, `${path} option ${label(index)}`, log)
	);
	if (options.some((option) => option === null)) return null;
	const sound = options as Option[];

	const correctCount = sound.filter((option) => option.correct).length;
	if (correctCount === 0) {
		log.error(path, 'No option is marked correct.');
		return null;
	}

	// Option counts are a house style, not a correctness property: a five-option
	// single-answer question grades perfectly well. Warn, never block.
	const expected =
		correctCount === 1 ? config.singleAnswerOptionCount : config.multiAnswerOptionCount;
	if (sound.length !== expected) {
		const kind = correctCount === 1 ? 'single-answer' : 'multi-answer';
		log.warn(path, `${kind} question has ${sound.length} options; ${expected} expected.`);
	}
	if (correctCount > MAXIMUM_SENSIBLE_CORRECT) {
		log.warn(path, `${correctCount} correct options — verify this is intended.`);
	}
	checkOptionLengths(sound, path, log);

	if (!isNonEmptyString(raw.stem)) return null;
	return {
		topic: isNonEmptyString(raw.topic) ? raw.topic : 'General',
		...(isNonEmptyString(raw.domain) ? { domain: raw.domain } : {}),
		stem: raw.stem,
		options: sound
	};
}

/**
 * Validates a parsed mock.
 *
 * @param input Anything at all — typically the result of `JSON.parse` on untrusted text.
 * @param config Exam shape, supplying the expected option counts.
 */
export function validateMock(input: unknown, config: ExamConfig): ValidationResult {
	const log = new IssueLog();

	if (!isRecord(input)) {
		log.error('mock', 'The top level is not a JSON object.');
		return {
			valid: false,
			errors: log.errors,
			warnings: log.warnings,
			questionCount: 0,
			mock: null
		};
	}
	if (!Array.isArray(input.questions) || input.questions.length === 0) {
		log.error('mock', 'Missing a non-empty "questions" array.');
		return {
			valid: false,
			errors: log.errors,
			warnings: log.warnings,
			questionCount: 0,
			mock: null
		};
	}
	if (!isRecord(input.config)) {
		log.warn('mock', 'No "config" block — engine defaults will be used.');
	}

	const questions = input.questions.map((question, index) =>
		validateQuestion(question, `Q${index + 1}`, config, log)
	);
	const valid = log.errors.length === 0;

	return {
		valid,
		errors: log.errors,
		warnings: log.warnings,
		questionCount: input.questions.length,
		mock: valid
			? ({
					...input,
					questions: questions as Question[]
				} as Mock)
			: null
	};
}
