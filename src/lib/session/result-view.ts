import { createLogger } from '../logger';
import type { StorageBackend } from './storage';

/**
 * How the results screen is laid out.
 *
 * Kept apart from {@link import('./preferences').Preferences} on purpose: those choices change
 * what the engine *does* — the mode it starts in, the pass mark, which unscored outcome decides
 * the verdict — whereas these only change what the results screen *shows*. Mixing the two would
 * mean a corrupted layout preference could take an exam setting down with it.
 *
 * Someone who only ever wants the domain bars and never the raw JSON should say so once. Every
 * field is optional on read and falls back on its own, so a partially written or hand-edited
 * record degrades to "use the defaults" rather than hiding the score.
 */

const logger = createLogger('result-view');

/** The one key this module owns. */
export const RESULT_VIEW_KEY = 'mock-exam-engine:result-view';

/** How much supporting detail each section carries. */
export type ResultDensity = 'compact' | 'detailed';

/** Remembered layout of the results screen. */
export interface ResultView {
	/** Whether secondary lines — counts, notes, per-question wording — are shown. */
	readonly density: ResultDensity;
	/** Whether the per-domain bars are expanded. */
	readonly domainsOpen: boolean;
	/** Whether the per-topic bars are expanded. */
	readonly topicsOpen: boolean;
	/** Whether the question strip is expanded. */
	readonly questionsOpen: boolean;
	/**
	 * Whether the raw JSON report is expanded.
	 *
	 * Closed by default: the report exists to be pasted into a generator, not read.
	 */
	readonly reportOpen: boolean;
}

export const DEFAULT_RESULT_VIEW: ResultView = {
	density: 'detailed',
	domainsOpen: true,
	topicsOpen: true,
	questionsOpen: true,
	reportOpen: false
};

const DENSITIES: readonly string[] = ['compact', 'detailed'];

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads the remembered layout, falling back field by field.
 *
 * A single bad field never discards the rest: one unreadable value should cost that value
 * alone, not every section state the candidate has set.
 */
export function loadResultView(backend: StorageBackend | null): ResultView {
	if (!backend) return DEFAULT_RESULT_VIEW;

	let raw: string | null;
	try {
		raw = backend.getItem(RESULT_VIEW_KEY);
	} catch (error) {
		logger.warn('Could not read the results layout.', error);
		return DEFAULT_RESULT_VIEW;
	}
	if (!raw) return DEFAULT_RESULT_VIEW;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		logger.warn('Discarding an unreadable results layout.', error);
		return DEFAULT_RESULT_VIEW;
	}
	if (typeof parsed !== 'object' || parsed === null) return DEFAULT_RESULT_VIEW;

	const record = parsed as Record<string, unknown>;
	return {
		density: DENSITIES.includes(record.density as string)
			? (record.density as ResultDensity)
			: DEFAULT_RESULT_VIEW.density,
		domainsOpen: readBoolean(record.domainsOpen, DEFAULT_RESULT_VIEW.domainsOpen),
		topicsOpen: readBoolean(record.topicsOpen, DEFAULT_RESULT_VIEW.topicsOpen),
		questionsOpen: readBoolean(record.questionsOpen, DEFAULT_RESULT_VIEW.questionsOpen),
		reportOpen: readBoolean(record.reportOpen, DEFAULT_RESULT_VIEW.reportOpen)
	};
}

/** Writes the remembered layout. Failure is logged, never thrown. */
export function saveResultView(backend: StorageBackend | null, view: ResultView): void {
	if (!backend) return;
	try {
		backend.setItem(RESULT_VIEW_KEY, JSON.stringify(view));
	} catch (error) {
		logger.warn('Could not save the results layout.', error);
	}
}

/** Forgets the remembered layout. */
export function clearResultView(backend: StorageBackend | null): void {
	if (!backend) return;
	try {
		backend.removeItem(RESULT_VIEW_KEY);
	} catch (error) {
		logger.warn('Could not clear the results layout.', error);
	}
}
