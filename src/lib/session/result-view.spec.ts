import { describe, expect, it, vi } from 'vitest';

import type { StorageBackend } from './storage';
import {
	clearResultView,
	DEFAULT_RESULT_VIEW,
	loadResultView,
	RESULT_VIEW_KEY,
	saveResultView,
	type ResultView
} from './result-view';

function makeBackend(initial: Record<string, string> = {}): StorageBackend & {
	data: Record<string, string>;
} {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = value;
		},
		removeItem: (key) => {
			delete data[key];
		}
	};
}

/** Stores `value` under the layout key, bypassing the writer's own validation. */
function backendWith(value: unknown) {
	return makeBackend({ [RESULT_VIEW_KEY]: JSON.stringify(value) });
}

/** Every field differs from its default, so a dropped field fails the round-trip. */
const CUSTOM: ResultView = {
	density: 'compact',
	domainsOpen: false,
	topicsOpen: false,
	questionsOpen: false,
	reportOpen: true
};

describe('results layout round-trip', () => {
	it('returns defaults when nothing has been saved', () => {
		expect(loadResultView(makeBackend())).toEqual(DEFAULT_RESULT_VIEW);
	});

	it('opens the sections that matter and closes the raw report by default', () => {
		expect(DEFAULT_RESULT_VIEW.domainsOpen).toBe(true);
		expect(DEFAULT_RESULT_VIEW.topicsOpen).toBe(true);
		expect(DEFAULT_RESULT_VIEW.questionsOpen).toBe(true);
		expect(DEFAULT_RESULT_VIEW.reportOpen).toBe(false);
	});

	it('remembers every field', () => {
		const backend = makeBackend();
		saveResultView(backend, CUSTOM);
		expect(loadResultView(backend)).toEqual(CUSTOM);
	});

	it('uses its own key, leaving other stored state untouched', () => {
		const backend = makeBackend({
			'mock-exam-engine:attempt': 'kept',
			'mock-exam-engine:preferences': 'kept too'
		});
		saveResultView(backend, CUSTOM);
		expect(backend.data['mock-exam-engine:attempt']).toBe('kept');
		expect(backend.data['mock-exam-engine:preferences']).toBe('kept too');
		expect(Object.keys(backend.data)).toContain(RESULT_VIEW_KEY);
	});

	it('forgets on request', () => {
		const backend = makeBackend();
		saveResultView(backend, CUSTOM);
		clearResultView(backend);
		expect(loadResultView(backend)).toEqual(DEFAULT_RESULT_VIEW);
	});
});

describe('results layout degrades field by field', () => {
	it('keeps the good fields when one is invalid', () => {
		const loaded = loadResultView(
			backendWith({ density: 'sideways', domainsOpen: false, reportOpen: true })
		);
		expect(loaded.density).toBe(DEFAULT_RESULT_VIEW.density);
		expect(loaded.domainsOpen).toBe(false);
		expect(loaded.reportOpen).toBe(true);
	});

	it.each([
		['an unknown density', { density: 'roomy' }],
		['a density of the wrong type', { density: 3 }],
		['a missing density', {}]
	])('falls back to the default density for %s', (_label, stored) => {
		expect(loadResultView(backendWith(stored)).density).toBe(DEFAULT_RESULT_VIEW.density);
	});

	it.each([
		['a string', { topicsOpen: 'yes' }],
		['a number', { topicsOpen: 1 }],
		['null', { topicsOpen: null }]
	])('rejects %s for a section state', (_label, stored) => {
		expect(loadResultView(backendWith(stored)).topicsOpen).toBe(DEFAULT_RESULT_VIEW.topicsOpen);
	});

	it('accepts every section being closed', () => {
		const loaded = loadResultView(
			backendWith({
				domainsOpen: false,
				topicsOpen: false,
				questionsOpen: false,
				reportOpen: false
			})
		);
		expect(loaded.domainsOpen).toBe(false);
		expect(loaded.topicsOpen).toBe(false);
		expect(loaded.questionsOpen).toBe(false);
		expect(loaded.reportOpen).toBe(false);
	});

	it.each([
		['unparseable JSON', '{not json'],
		['a bare string', '"nope"'],
		['null', 'null']
	])('falls back entirely for %s', (_label, raw) => {
		expect(loadResultView(makeBackend({ [RESULT_VIEW_KEY]: raw }))).toEqual(DEFAULT_RESULT_VIEW);
	});
});

describe('results layout survives a hostile backend', () => {
	it('does nothing when storage is unavailable', () => {
		expect(loadResultView(null)).toEqual(DEFAULT_RESULT_VIEW);
		expect(() => saveResultView(null, CUSTOM)).not.toThrow();
		expect(() => clearResultView(null)).not.toThrow();
	});

	it('survives a backend that throws on read', () => {
		const hostile: StorageBackend = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: vi.fn(),
			removeItem: vi.fn()
		};
		expect(loadResultView(hostile)).toEqual(DEFAULT_RESULT_VIEW);
	});

	it('survives a backend that throws on write or clear', () => {
		const hostile: StorageBackend = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		};
		expect(() => saveResultView(hostile, CUSTOM)).not.toThrow();
		expect(() => clearResultView(hostile)).not.toThrow();
	});
});
