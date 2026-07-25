import { describe, expect, it, vi } from 'vitest';

import type { StorageBackend } from './storage';
import {
	clearPreferences,
	DEFAULT_PREFERENCES,
	loadPreferences,
	PREFERENCES_KEY,
	savePreferences,
	type Preferences
} from './preferences';

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

/** Stores `value` under the preferences key, bypassing the writer's own validation. */
function backendWith(value: unknown) {
	return makeBackend({ [PREFERENCES_KEY]: JSON.stringify(value) });
}

const CUSTOM: Preferences = {
	mode: 'practice',
	unscoredStrategy: 'worst',
	passPercent: 80,
	secondsPerQuestion: 90
};

describe('preferences round-trip', () => {
	it('returns defaults when nothing has been saved', () => {
		expect(loadPreferences(makeBackend())).toEqual(DEFAULT_PREFERENCES);
	});

	it('remembers every field', () => {
		const backend = makeBackend();
		savePreferences(backend, CUSTOM);
		expect(loadPreferences(backend)).toEqual(CUSTOM);
	});

	it('uses its own key, leaving a saved attempt untouched', () => {
		const backend = makeBackend({ 'mock-exam-engine:attempt': 'kept' });
		savePreferences(backend, CUSTOM);
		expect(backend.data['mock-exam-engine:attempt']).toBe('kept');
		expect(Object.keys(backend.data)).toContain(PREFERENCES_KEY);
	});

	it('forgets on request', () => {
		const backend = makeBackend();
		savePreferences(backend, CUSTOM);
		clearPreferences(backend);
		expect(loadPreferences(backend)).toEqual(DEFAULT_PREFERENCES);
	});
});

describe('preferences degrade field by field', () => {
	it('keeps the good fields when one is invalid', () => {
		const loaded = loadPreferences(
			backendWith({ mode: 'practice', unscoredStrategy: 'nonsense', passPercent: 80 })
		);
		expect(loaded.mode).toBe('practice');
		expect(loaded.passPercent).toBe(80);
		expect(loaded.unscoredStrategy).toBe(DEFAULT_PREFERENCES.unscoredStrategy);
	});

	it.each([
		['an unknown mode', { mode: 'sideways' }],
		['a mode of the wrong type', { mode: 7 }]
	])('falls back to the default mode for %s', (_label, stored) => {
		expect(loadPreferences(backendWith(stored)).mode).toBe(DEFAULT_PREFERENCES.mode);
	});

	it.each([
		['a pass mark above 100', { passPercent: 140 }],
		['a pass mark of zero', { passPercent: 0 }],
		['a non-numeric pass mark', { passPercent: 'high' }],
		['a NaN pass mark', { passPercent: Number.NaN }]
	])('rejects %s', (_label, stored) => {
		expect(loadPreferences(backendWith(stored)).passPercent).toBeUndefined();
	});

	it.each([
		['an implausibly short budget', { secondsPerQuestion: 2 }],
		['an implausibly long budget', { secondsPerQuestion: 99999 }]
	])('rejects %s', (_label, stored) => {
		expect(loadPreferences(backendWith(stored)).secondsPerQuestion).toBeUndefined();
	});

	it('accepts values at the edge of the permitted range', () => {
		const loaded = loadPreferences(backendWith({ passPercent: 100, secondsPerQuestion: 10 }));
		expect(loaded.passPercent).toBe(100);
		expect(loaded.secondsPerQuestion).toBe(10);
	});

	it.each([
		['unparseable JSON', '{not json'],
		['a bare string', '"nope"'],
		['null', 'null']
	])('falls back entirely for %s', (_label, raw) => {
		expect(loadPreferences(makeBackend({ [PREFERENCES_KEY]: raw }))).toEqual(DEFAULT_PREFERENCES);
	});
});

describe('preferences survive a hostile backend', () => {
	it('does nothing when storage is unavailable', () => {
		expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
		expect(() => savePreferences(null, CUSTOM)).not.toThrow();
		expect(() => clearPreferences(null)).not.toThrow();
	});

	it('survives a backend that throws on read', () => {
		const hostile: StorageBackend = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: vi.fn(),
			removeItem: vi.fn()
		};
		expect(loadPreferences(hostile)).toEqual(DEFAULT_PREFERENCES);
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
		expect(() => savePreferences(hostile, CUSTOM)).not.toThrow();
		expect(() => clearPreferences(hostile)).not.toThrow();
	});
});
