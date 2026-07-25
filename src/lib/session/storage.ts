import { createLogger } from '../logger';
import type { Attempt, ExamMode, Mock } from '../domain/types';
import type { Stopwatch } from '../domain/timer';

/**
 * Crash-safe resume.
 *
 * A timed exam that a refresh destroys is worse than no exam: the candidate loses the one
 * thing they cannot recreate, which is the time already spent. Everything needed to restore
 * a sitting exactly — including the stopwatch and the seed — is written to a single storage
 * key after every meaningful action, and cleared on submission.
 *
 * The storage backend is injected so this is testable without a DOM, and so a browser with
 * storage disabled degrades to "no resume" rather than crashing.
 */

const logger = createLogger('storage');

/** The one key this module owns. */
export const STORAGE_KEY = 'mock-exam-engine:attempt';

/**
 * Version of the persisted shape. Bumping it discards saved attempts rather than risking a
 * restore that half-matches the current code.
 */
export const STORAGE_VERSION = 1;

/** Everything required to restore a sitting exactly as it was. */
export interface PersistedAttempt {
	readonly version: number;
	readonly mock: Mock;
	readonly attempt: Attempt;
	readonly stopwatch: Stopwatch;
	readonly mode: ExamMode;
	/** Index of the question that was on screen. */
	readonly currentIndex: number;
	/** ISO-8601 timestamp of the last write, shown when offering to resume. */
	readonly savedAt: string;
}

/** The subset of the Web Storage API this module needs. */
export interface StorageBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Returns the browser's `localStorage`, or `null` where it is unavailable.
 *
 * Private browsing modes and storage-blocking settings make access throw rather than return
 * undefined, so this probes rather than assuming.
 */
export function defaultBackend(): StorageBackend | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		const probe = `${STORAGE_KEY}:probe`;
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		return localStorage;
	} catch {
		logger.warn('Local storage unavailable; attempts will not survive a refresh.');
		return null;
	}
}

/** Persists an in-flight attempt. Failure is logged, never thrown: saving must not interrupt. */
export function saveAttempt(
	backend: StorageBackend | null,
	payload: Omit<PersistedAttempt, 'version' | 'savedAt'>,
	savedAt: string
): void {
	if (!backend) return;
	try {
		backend.setItem(STORAGE_KEY, JSON.stringify({ ...payload, version: STORAGE_VERSION, savedAt }));
	} catch (error) {
		// Most likely a quota failure on a very large mock. The attempt continues in memory.
		logger.warn('Could not save the attempt; it will not survive a refresh.', error);
	}
}

/**
 * Reads a saved attempt.
 *
 * Returns `null` for anything that is absent, unparseable, from a different version, or
 * structurally wrong. Restoring a half-valid attempt would corrupt a sitting in ways that
 * only surface at grading, so anything doubtful is discarded.
 */
export function loadAttempt(backend: StorageBackend | null): PersistedAttempt | null {
	if (!backend) return null;
	let raw: string | null;
	try {
		raw = backend.getItem(STORAGE_KEY);
	} catch (error) {
		logger.warn('Could not read saved attempts.', error);
		return null;
	}
	if (!raw) return null;

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isPersistedAttempt(parsed)) {
			logger.warn('Discarding a saved attempt that does not match the expected shape.');
			return null;
		}
		if (parsed.version !== STORAGE_VERSION) {
			logger.info('Discarding a saved attempt from an older version.');
			return null;
		}
		return parsed;
	} catch (error) {
		logger.warn('Discarding an unreadable saved attempt.', error);
		return null;
	}
}

/** Removes any saved attempt. Called on submission and on an explicit discard. */
export function clearAttempt(backend: StorageBackend | null): void {
	if (!backend) return;
	try {
		backend.removeItem(STORAGE_KEY);
	} catch (error) {
		logger.warn('Could not clear the saved attempt.', error);
	}
}

/** Structural check covering every field the restore path relies on. */
function isPersistedAttempt(value: unknown): value is PersistedAttempt {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	const attempt = candidate.attempt as Record<string, unknown> | undefined;
	const mock = candidate.mock as Record<string, unknown> | undefined;
	return (
		typeof candidate.version === 'number' &&
		typeof candidate.currentIndex === 'number' &&
		typeof candidate.savedAt === 'string' &&
		(candidate.mode === 'exam' || candidate.mode === 'practice') &&
		typeof candidate.stopwatch === 'object' &&
		candidate.stopwatch !== null &&
		typeof mock === 'object' &&
		mock !== null &&
		Array.isArray(mock.questions) &&
		typeof attempt === 'object' &&
		attempt !== null &&
		Array.isArray(attempt.answers) &&
		typeof attempt.seed === 'number'
	);
}
