import { createLogger } from '../logger';
import type { Report } from '../domain/report';
import type { Difficulty } from '../prompt/sections';
import type { StorageBackend } from './storage';

/**
 * What the prompt studio remembers.
 *
 * This is the piece that turns the engine from a scorer into a loop. Two things are kept
 * between visits:
 *
 * - **The topics text**, verbatim as pasted. Retyping a lesson list every day is exactly the
 *   friction that stops people sitting a daily mock.
 * - **The last report**, so the next prompt carries forward whatever scored below the pass
 *   mark without anyone having to notice, remember or copy it.
 *
 * Only the report's weak topics are actually needed, but the whole report is small and
 * keeping it means the results of the last sitting survive a refresh too.
 */

const logger = createLogger('studio');

/** The one key this module owns. */
export const STUDIO_KEY = 'mock-exam-engine:studio';

/** Version of the persisted shape; a mismatch discards rather than half-restores. */
export const STUDIO_VERSION = 2;

/** Remembered prompt-studio state. */
export interface StudioState {
	/** Topics exactly as pasted, so the textarea can be restored unchanged. */
	readonly topicsText: string;
	readonly questionCount: number;
	/**
	 * An explicit multi-answer count, or `null` to derive it from the question count.
	 *
	 * Stored as an override rather than an absolute number so that changing the length of a
	 * mock keeps its proportions, right up until someone states a preference.
	 */
	readonly multiAnswerCountOverride: number | null;
	readonly difficulty: Difficulty;
	readonly reviewQuestionCount: number;
	/** The most recent graded report, or `null` before anything has been sat. */
	readonly lastReport: Report | null;
}

/**
 * Defaults to a full-length exam: 65 questions, which at 120 seconds each is the real
 * 130-minute budget. Shortening the count shortens the clock in proportion.
 */
export const DEFAULT_STUDIO_STATE: StudioState = {
	topicsText: '',
	questionCount: 65,
	multiAnswerCountOverride: null,
	difficulty: 'exam',
	reviewQuestionCount: 5,
	lastReport: null
};

const DIFFICULTIES: readonly string[] = ['building', 'exam', 'brutal'];

const MAX_QUESTION_COUNT = 200;
/** Pasting a whole syllabus is fine; pasting a textbook is not. */
const MAX_TOPICS_LENGTH = 20_000;

function readCount(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.max(0, Math.min(MAX_QUESTION_COUNT, Math.round(value)));
}

/** Accepts a report only if the fields the prompt actually reads are present. */
function readReport(value: unknown): Report | null {
	if (typeof value !== 'object' || value === null) return null;
	const candidate = value as Record<string, unknown>;
	if (!Array.isArray(candidate.weak_topics)) return null;
	if (typeof candidate.score !== 'object' || candidate.score === null) return null;
	return candidate as unknown as Report;
}

/** Reads remembered studio state, falling back field by field. */
export function loadStudio(backend: StorageBackend | null): StudioState {
	if (!backend) return DEFAULT_STUDIO_STATE;

	let raw: string | null;
	try {
		raw = backend.getItem(STUDIO_KEY);
	} catch (error) {
		logger.warn('Could not read the prompt studio state.', error);
		return DEFAULT_STUDIO_STATE;
	}
	if (!raw) return DEFAULT_STUDIO_STATE;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		logger.warn('Discarding unreadable prompt studio state.', error);
		return DEFAULT_STUDIO_STATE;
	}
	if (typeof parsed !== 'object' || parsed === null) return DEFAULT_STUDIO_STATE;

	const record = parsed as Record<string, unknown>;
	if (record.version !== STUDIO_VERSION) return DEFAULT_STUDIO_STATE;

	return {
		topicsText:
			typeof record.topicsText === 'string'
				? record.topicsText.slice(0, MAX_TOPICS_LENGTH)
				: DEFAULT_STUDIO_STATE.topicsText,
		questionCount: readCount(record.questionCount, DEFAULT_STUDIO_STATE.questionCount),
		multiAnswerCountOverride:
			typeof record.multiAnswerCountOverride === 'number'
				? readCount(record.multiAnswerCountOverride, 0)
				: null,
		difficulty: DIFFICULTIES.includes(record.difficulty as string)
			? (record.difficulty as Difficulty)
			: DEFAULT_STUDIO_STATE.difficulty,
		reviewQuestionCount: readCount(
			record.reviewQuestionCount,
			DEFAULT_STUDIO_STATE.reviewQuestionCount
		),
		lastReport: readReport(record.lastReport)
	};
}

/** Writes remembered studio state. Failure is logged, never thrown. */
export function saveStudio(backend: StorageBackend | null, state: StudioState): void {
	if (!backend) return;
	try {
		backend.setItem(STUDIO_KEY, JSON.stringify({ ...state, version: STUDIO_VERSION }));
	} catch (error) {
		logger.warn('Could not save the prompt studio state.', error);
	}
}

/** Forgets remembered studio state. */
export function clearStudio(backend: StorageBackend | null): void {
	if (!backend) return;
	try {
		backend.removeItem(STUDIO_KEY);
	} catch (error) {
		logger.warn('Could not clear the prompt studio state.', error);
	}
}
