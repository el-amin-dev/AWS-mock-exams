import { describe, expect, it, vi } from 'vitest';

import type { Report } from '../domain/report';
import type { StorageBackend } from './storage';
import {
	clearStudio,
	DEFAULT_STUDIO_STATE,
	loadStudio,
	saveStudio,
	STUDIO_KEY,
	STUDIO_VERSION,
	type StudioState
} from './studio';

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

/** Stores a value under the studio key, bypassing the writer's own shaping. */
function backendWith(value: Record<string, unknown>) {
	return makeBackend({ [STUDIO_KEY]: JSON.stringify({ version: STUDIO_VERSION, ...value }) });
}

const REPORT = {
	weak_topics: ['VPC routing', 'KMS key policies'],
	score: { true_percent: 60 }
} as unknown as Report;

const STATE: StudioState = {
	topicsText: '- VPC routing\n- EBS volumes',
	questionCount: 15,
	multiAnswerCountOverride: 4,
	difficulty: 'brutal',
	reviewQuestionCount: 3,
	lastReport: REPORT
};

describe('studio round-trip', () => {
	it('returns defaults when nothing has been saved', () => {
		expect(loadStudio(makeBackend())).toEqual(DEFAULT_STUDIO_STATE);
	});

	it('remembers everything, including the pasted text verbatim', () => {
		const backend = makeBackend();
		saveStudio(backend, STATE);
		const loaded = loadStudio(backend);
		expect(loaded.topicsText).toBe(STATE.topicsText);
		expect(loaded.questionCount).toBe(15);
		expect(loaded.difficulty).toBe('brutal');
	});

	/** This is the loop: yesterday's weak topics become today's review questions. */
	it('remembers the last report so weak topics carry forward', () => {
		const backend = makeBackend();
		saveStudio(backend, STATE);
		expect(loadStudio(backend).lastReport?.weak_topics).toEqual([
			'VPC routing',
			'KMS key policies'
		]);
	});

	it('uses its own key, leaving the attempt and preferences untouched', () => {
		const backend = makeBackend({
			'mock-exam-engine:attempt': 'a',
			'mock-exam-engine:preferences': 'p'
		});
		saveStudio(backend, STATE);
		expect(backend.data['mock-exam-engine:attempt']).toBe('a');
		expect(backend.data['mock-exam-engine:preferences']).toBe('p');
	});

	it('forgets on request', () => {
		const backend = makeBackend();
		saveStudio(backend, STATE);
		clearStudio(backend);
		expect(loadStudio(backend)).toEqual(DEFAULT_STUDIO_STATE);
	});
});

describe('studio degrades rather than losing everything', () => {
	it('discards state from a different version', () => {
		const backend = makeBackend({
			[STUDIO_KEY]: JSON.stringify({ ...STATE, version: STUDIO_VERSION + 1 })
		});
		expect(loadStudio(backend)).toEqual(DEFAULT_STUDIO_STATE);
	});

	it.each([
		['unparseable JSON', '{broken'],
		['a bare string', '"nope"'],
		['null', 'null']
	])('falls back entirely for %s', (_label, raw) => {
		expect(loadStudio(makeBackend({ [STUDIO_KEY]: raw }))).toEqual(DEFAULT_STUDIO_STATE);
	});

	it('keeps the good fields when one is invalid', () => {
		const loaded = loadStudio(
			backendWith({ topicsText: 'kept', difficulty: 'sideways', questionCount: 12 })
		);
		expect(loaded.topicsText).toBe('kept');
		expect(loaded.questionCount).toBe(12);
		expect(loaded.difficulty).toBe(DEFAULT_STUDIO_STATE.difficulty);
	});

	it('rejects a report that lacks the fields the prompt reads', () => {
		expect(loadStudio(backendWith({ lastReport: { nonsense: true } })).lastReport).toBeNull();
		expect(loadStudio(backendWith({ lastReport: 'a string' })).lastReport).toBeNull();
		expect(loadStudio(backendWith({ lastReport: { weak_topics: [] } })).lastReport).toBeNull();
	});

	it('accepts a report carrying the fields the prompt reads', () => {
		const loaded = loadStudio(backendWith({ lastReport: REPORT }));
		expect(loaded.lastReport?.weak_topics).toEqual(['VPC routing', 'KMS key policies']);
	});

	it('clamps an absurd question count', () => {
		expect(loadStudio(backendWith({ questionCount: 99999 })).questionCount).toBe(200);
		expect(loadStudio(backendWith({ questionCount: -4 })).questionCount).toBe(0);
	});

	it('ignores a non-numeric count', () => {
		expect(loadStudio(backendWith({ questionCount: 'ten' })).questionCount).toBe(
			DEFAULT_STUDIO_STATE.questionCount
		);
	});

	it('truncates an implausibly large paste rather than holding it all', () => {
		const huge = 'x'.repeat(50_000);
		expect(loadStudio(backendWith({ topicsText: huge })).topicsText.length).toBe(20_000);
	});

	it('ignores a non-string paste', () => {
		expect(loadStudio(backendWith({ topicsText: 42 })).topicsText).toBe('');
	});
});

describe('studio survives a hostile backend', () => {
	it('does nothing when storage is unavailable', () => {
		expect(loadStudio(null)).toEqual(DEFAULT_STUDIO_STATE);
		expect(() => saveStudio(null, STATE)).not.toThrow();
		expect(() => clearStudio(null)).not.toThrow();
	});

	it('survives a backend that throws on read', () => {
		const hostile: StorageBackend = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: vi.fn(),
			removeItem: vi.fn()
		};
		expect(loadStudio(hostile)).toEqual(DEFAULT_STUDIO_STATE);
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
		expect(() => saveStudio(hostile, STATE)).not.toThrow();
		expect(() => clearStudio(hostile)).not.toThrow();
	});
});
