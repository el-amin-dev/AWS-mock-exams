import { createLogger } from '../logger';
import { DEFAULT_UNSCORED_STRATEGY } from '../domain/constants';
import type { ExamMode, UnscoredStrategy } from '../domain/types';
import type { StorageBackend } from './storage';

/**
 * Remembered choices.
 *
 * Separate from the saved attempt on purpose: an attempt is transient and is cleared the
 * moment it is submitted, whereas these outlive every sitting. Someone who always practises
 * before they test, or who always wants judging on the worst case, should say so once rather
 * than on every mock they load.
 *
 * Every field is optional and every read falls back to a default, so a partially written or
 * outdated record degrades to "use the defaults" instead of breaking the home screen.
 */

const logger = createLogger('preferences');

/** The one key this module owns. */
export const PREFERENCES_KEY = 'mock-exam-engine:preferences';

/** Choices that outlive a single attempt. */
export interface Preferences {
	/** The mode selected last time, preselected on the home screen. */
	readonly mode: ExamMode;
	/** Which unscored outcome decides pass or fail. */
	readonly unscoredStrategy: UnscoredStrategy;
	/** Percentage of scored questions required to pass. */
	readonly passPercent: number | undefined;
	/** Time budget per question, in seconds. */
	readonly secondsPerQuestion: number | undefined;
}

export const DEFAULT_PREFERENCES: Preferences = {
	mode: 'exam',
	unscoredStrategy: DEFAULT_UNSCORED_STRATEGY,
	passPercent: undefined,
	secondsPerQuestion: undefined
};

const MODES: readonly string[] = ['exam', 'practice'];
const STRATEGIES: readonly string[] = ['off', 'random', 'worst', 'best'];

/** Bounds on the numeric fields, so a corrupted record cannot produce an unsittable exam. */
const MIN_PASS_PERCENT = 1;
const MAX_PASS_PERCENT = 100;
const MIN_SECONDS_PER_QUESTION = 10;
const MAX_SECONDS_PER_QUESTION = 3600;

function readNumber(value: unknown, min: number, max: number): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	if (value < min || value > max) return undefined;
	return value;
}

/**
 * Reads remembered choices, falling back field by field.
 *
 * A single bad field never discards the rest: someone who hand-edits storage and gets one
 * value wrong should lose that value, not every preference they have set.
 */
export function loadPreferences(backend: StorageBackend | null): Preferences {
	if (!backend) return DEFAULT_PREFERENCES;

	let raw: string | null;
	try {
		raw = backend.getItem(PREFERENCES_KEY);
	} catch (error) {
		logger.warn('Could not read preferences.', error);
		return DEFAULT_PREFERENCES;
	}
	if (!raw) return DEFAULT_PREFERENCES;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		logger.warn('Discarding unreadable preferences.', error);
		return DEFAULT_PREFERENCES;
	}
	if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES;

	const record = parsed as Record<string, unknown>;
	return {
		mode: MODES.includes(record.mode as string)
			? (record.mode as ExamMode)
			: DEFAULT_PREFERENCES.mode,
		unscoredStrategy: STRATEGIES.includes(record.unscoredStrategy as string)
			? (record.unscoredStrategy as UnscoredStrategy)
			: DEFAULT_PREFERENCES.unscoredStrategy,
		passPercent: readNumber(record.passPercent, MIN_PASS_PERCENT, MAX_PASS_PERCENT),
		secondsPerQuestion: readNumber(
			record.secondsPerQuestion,
			MIN_SECONDS_PER_QUESTION,
			MAX_SECONDS_PER_QUESTION
		)
	};
}

/** Writes remembered choices. Failure is logged, never thrown. */
export function savePreferences(backend: StorageBackend | null, preferences: Preferences): void {
	if (!backend) return;
	try {
		backend.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
	} catch (error) {
		logger.warn('Could not save preferences.', error);
	}
}

/** Forgets remembered choices. */
export function clearPreferences(backend: StorageBackend | null): void {
	if (!backend) return;
	try {
		backend.removeItem(PREFERENCES_KEY);
	} catch (error) {
		logger.warn('Could not clear preferences.', error);
	}
}
