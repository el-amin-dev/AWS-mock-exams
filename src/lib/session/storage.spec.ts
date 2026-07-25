import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMock } from '../../../tests/factories';
import { startStopwatch } from '../domain/timer';
import { createAttempt } from './attempt';
import {
	clearAttempt,
	defaultBackend,
	loadAttempt,
	saveAttempt,
	STORAGE_KEY,
	STORAGE_VERSION,
	type PersistedAttempt,
	type StorageBackend
} from './storage';

/** An in-memory backend, so persistence is testable without a DOM. */
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

const SAVED_AT = '2026-07-25T09:30:00.000Z';

function payload(): Omit<PersistedAttempt, 'version' | 'savedAt'> {
	return {
		mock: makeMock([{ correct: [0] }, { correct: [0] }]),
		attempt: createAttempt(2, 'exam', '2026-07-25T09:00:00.000Z', 4242),
		stopwatch: startStopwatch(1_000_000),
		mode: 'exam',
		currentIndex: 1
	};
}

describe('saveAttempt and loadAttempt', () => {
	let backend: ReturnType<typeof makeBackend>;

	beforeEach(() => {
		backend = makeBackend();
	});

	it('round-trips an attempt intact', () => {
		saveAttempt(backend, payload(), SAVED_AT);
		const restored = loadAttempt(backend);
		expect(restored?.attempt.seed).toBe(4242);
		expect(restored?.currentIndex).toBe(1);
		expect(restored?.mode).toBe('exam');
		expect(restored?.savedAt).toBe(SAVED_AT);
		expect(restored?.mock.questions).toHaveLength(2);
	});

	/** Without the seed, a resumed attempt would re-shuffle into a different exam. */
	it('preserves the seed and the stopwatch, which the restore depends on', () => {
		saveAttempt(backend, payload(), SAVED_AT);
		const restored = loadAttempt(backend);
		expect(restored?.attempt.seed).toBe(4242);
		expect(restored?.stopwatch.runningSinceMs).toBe(1_000_000);
	});

	it('uses exactly one storage key', () => {
		saveAttempt(backend, payload(), SAVED_AT);
		expect(Object.keys(backend.data)).toEqual([STORAGE_KEY]);
	});

	it('overwrites rather than accumulating', () => {
		saveAttempt(backend, payload(), SAVED_AT);
		saveAttempt(backend, { ...payload(), currentIndex: 0 }, '2026-07-25T09:31:00.000Z');
		expect(Object.keys(backend.data)).toHaveLength(1);
		expect(loadAttempt(backend)?.currentIndex).toBe(0);
	});

	it('returns null when nothing was saved', () => {
		expect(loadAttempt(backend)).toBeNull();
	});

	it('clears the saved attempt', () => {
		saveAttempt(backend, payload(), SAVED_AT);
		clearAttempt(backend);
		expect(loadAttempt(backend)).toBeNull();
	});
});

describe('loadAttempt — rejecting anything doubtful', () => {
	it('discards unparseable JSON', () => {
		expect(loadAttempt(makeBackend({ [STORAGE_KEY]: '{not json' }))).toBeNull();
	});

	it('discards a different storage version', () => {
		const backend = makeBackend();
		saveAttempt(backend, payload(), SAVED_AT);
		const stored = JSON.parse(backend.data[STORAGE_KEY] as string) as PersistedAttempt;
		backend.data[STORAGE_KEY] = JSON.stringify({ ...stored, version: STORAGE_VERSION + 1 });
		expect(loadAttempt(backend)).toBeNull();
	});

	it.each([
		['a bare value', '"just a string"'],
		['null', 'null'],
		['an empty object', '{}'],
		['a missing questions array', '{"version":1,"mock":{},"attempt":{"answers":[],"seed":1}}']
	])('discards %s', (_label, raw) => {
		expect(loadAttempt(makeBackend({ [STORAGE_KEY]: raw }))).toBeNull();
	});

	it('discards an attempt whose seed is missing', () => {
		const backend = makeBackend();
		saveAttempt(backend, payload(), SAVED_AT);
		const stored = JSON.parse(backend.data[STORAGE_KEY] as string) as PersistedAttempt;
		const attemptWithoutSeed: Record<string, unknown> = { ...stored.attempt };
		delete attemptWithoutSeed.seed;
		backend.data[STORAGE_KEY] = JSON.stringify({ ...stored, attempt: attemptWithoutSeed });
		expect(loadAttempt(backend)).toBeNull();
	});
});

describe('storage degrades rather than crashing', () => {
	it('does nothing at all when storage is unavailable', () => {
		expect(() => saveAttempt(null, payload(), SAVED_AT)).not.toThrow();
		expect(loadAttempt(null)).toBeNull();
		expect(() => clearAttempt(null)).not.toThrow();
	});

	/** A quota failure must not interrupt an exam in progress. */
	it('survives a backend that throws on write', () => {
		const hostile: StorageBackend = {
			getItem: () => null,
			setItem: () => {
				throw new DOMException('QuotaExceededError');
			},
			removeItem: vi.fn()
		};
		expect(() => saveAttempt(hostile, payload(), SAVED_AT)).not.toThrow();
	});

	it('survives a backend that throws on read', () => {
		const hostile: StorageBackend = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: vi.fn(),
			removeItem: vi.fn()
		};
		expect(loadAttempt(hostile)).toBeNull();
	});

	it('survives a backend that throws on clear', () => {
		const hostile: StorageBackend = {
			getItem: () => null,
			setItem: vi.fn(),
			removeItem: () => {
				throw new Error('blocked');
			}
		};
		expect(() => clearAttempt(hostile)).not.toThrow();
	});
});

describe('defaultBackend', () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

	function stubLocalStorage(value: unknown) {
		Object.defineProperty(globalThis, 'localStorage', { value, configurable: true });
	}

	afterEach(() => {
		if (original) Object.defineProperty(globalThis, 'localStorage', original);
		else Reflect.deleteProperty(globalThis as Record<string, unknown>, 'localStorage');
	});

	it('returns the store when it is usable', () => {
		const store = makeBackend();
		stubLocalStorage(store);
		expect(defaultBackend()).toBe(store);
	});

	/** The probe must leave nothing behind. */
	it('cleans up after probing', () => {
		const store = makeBackend();
		stubLocalStorage(store);
		defaultBackend();
		expect(Object.keys(store.data)).toEqual([]);
	});

	/** Private browsing makes writes throw rather than fail quietly. */
	it('returns null when writing throws', () => {
		stubLocalStorage({
			getItem: () => null,
			setItem: () => {
				throw new DOMException('SecurityError');
			},
			removeItem: () => undefined
		});
		expect(defaultBackend()).toBeNull();
	});

	it('returns null when there is no store at all', () => {
		stubLocalStorage(undefined);
		expect(defaultBackend()).toBeNull();
	});
});
