import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMock } from '../../../tests/factories';
import { PREFERENCES_KEY } from '../session/preferences';
import { STORAGE_KEY } from '../session/storage';
import type { StorageBackend } from '../session/storage';
import { ExamSession } from './session.svelte';

/**
 * The session is the only stateful part of the engine, so these tests drive it the way the
 * UI does — through its public methods — and assert on what a candidate would observe.
 * Time is controlled with fake timers so the wall-clock behaviour is deterministic.
 */

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

/**
 * Three single-answer questions plus one "Select TWO", all with option 0 correct.
 *
 * Randomisation is switched off so a spec can address a question by index and mean it.
 * Shuffling itself is covered in the attempt specs, where it is the subject rather than
 * an obstacle.
 */
const MOCK = makeMock(
	[
		{ topic: 'A', domain: 'Secure', correct: [0] },
		{ topic: 'A', domain: 'Secure', correct: [0] },
		{ topic: 'B', domain: 'Resilient', correct: [0] },
		{ topic: 'B', domain: 'Resilient', correct: [0, 1] }
	],
	{ config: { randomize_questions: false, randomize_options: false } }
);

/** Index of the correct option for the question currently on screen. */
function correctOptionFor(session: ExamSession): number {
	return session.question?.options.findIndex((option) => option.correct) ?? 0;
}

/** Answers the current question correctly, whatever its shape. */
function answerCorrectly(session: ExamSession): void {
	session.question?.options.forEach((option, index) => {
		if (option.correct) session.select(index);
	});
}

let backend: ReturnType<typeof makeBackend>;
let session: ExamSession;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-07-25T09:00:00.000Z'));
	backend = makeBackend();
	session = new ExamSession(backend);
});

afterEach(() => {
	session.dispose();
	vi.useRealTimers();
});

describe('loading and starting', () => {
	it('starts on the home screen with nothing loaded', () => {
		expect(session.view).toBe('home');
		expect(session.total).toBe(0);
	});

	it('moves to the ready screen without starting the clock', () => {
		session.load(MOCK, 'exam');
		expect(session.view).toBe('ready');
		expect(session.total).toBe(4);
		expect(session.stopwatch).toBeNull();
		expect(session.displaySeconds).toBe(0);
	});

	it('starts the clock only on start', () => {
		session.load(MOCK, 'exam');
		session.start();
		expect(session.view).toBe('exam');
		expect(session.stopwatch).not.toBeNull();
	});

	it('presents every question exactly once', () => {
		session.load(MOCK, 'exam');
		expect(session.questions).toHaveLength(4);
		expect(new Set(session.questions.map((q) => q.stem)).size).toBe(
			new Set(MOCK.questions.map((q) => q.stem)).size
		);
	});
});

describe('the clock', () => {
	it('counts down in exam mode', () => {
		session.load(MOCK, 'exam');
		session.start();
		expect(session.displaySeconds).toBe(session.timeLimitSeconds);
		vi.advanceTimersByTime(30_000);
		expect(session.displaySeconds).toBe(session.timeLimitSeconds - 30);
	});

	it('counts up in practice mode', () => {
		session.load(MOCK, 'practice');
		session.start();
		expect(session.displaySeconds).toBe(0);
		vi.advanceTimersByTime(45_000);
		expect(session.displaySeconds).toBe(45);
	});

	it('auto-submits when exam time expires', () => {
		session.load(MOCK, 'exam');
		session.start();
		vi.advanceTimersByTime((session.timeLimitSeconds + 2) * 1000);
		expect(session.view).toBe('result');
	});

	/** Practice is for learning, so it must never cut anyone off. */
	it('never auto-submits in practice mode, however long it runs', () => {
		session.load(MOCK, 'practice');
		session.start();
		vi.advanceTimersByTime(6 * 60 * 60 * 1000);
		expect(session.view).toBe('exam');
	});

	it('warns only as exam time runs low', () => {
		session.load(MOCK, 'exam');
		session.start();
		expect(session.isLowOnTime).toBe(false);
		vi.advanceTimersByTime((session.timeLimitSeconds - 10) * 1000);
		expect(session.isLowOnTime).toBe(true);
	});
});

describe('answering', () => {
	beforeEach(() => {
		session.load(MOCK, 'exam');
		session.start();
	});

	it('records a selection', () => {
		session.select(2);
		expect(session.currentAnswer).toEqual([2]);
	});

	it('replaces the selection on a single-answer question', () => {
		session.select(1);
		session.select(3);
		expect(session.currentAnswer).toEqual([3]);
	});

	it('refuses to select a struck option', () => {
		session.strike(1);
		session.select(1);
		expect(session.currentAnswer).toEqual([]);
		expect(session.currentStruck).toEqual([1]);
	});

	it('flags and unflags the current question', () => {
		session.flag();
		expect(session.isCurrentFlagged).toBe(true);
		expect(session.flaggedCount).toBe(1);
		session.flag();
		expect(session.isCurrentFlagged).toBe(false);
	});

	it('navigates without falling off either end', () => {
		expect(session.currentIndex).toBe(0);
		session.previous();
		expect(session.currentIndex).toBe(0);
		session.next();
		expect(session.currentIndex).toBe(1);
		session.goTo(3);
		expect(session.currentIndex).toBe(3);
		session.next();
		expect(session.currentIndex).toBe(3);
	});

	it('charges time to the question that was on screen', () => {
		vi.advanceTimersByTime(20_000);
		session.next();
		expect(session.attempt?.secondsOnQuestion[0]).toBe(20);
		expect(session.attempt?.secondsOnQuestion[1]).toBe(0);
	});
});

describe('practice mode', () => {
	beforeEach(() => {
		session.load(MOCK, 'practice');
		session.start();
	});

	it('reveals nothing before Check is pressed', () => {
		answerCorrectly(session);
		expect(session.isRevealed).toBe(false);
	});

	it('refuses to check an incomplete answer', () => {
		expect(session.canCheck).toBe(false);
		session.check();
		expect(session.isRevealed).toBe(false);
	});

	it('reveals the answer once checked, and will not un-reveal it', () => {
		answerCorrectly(session);
		expect(session.canCheck).toBe(true);
		session.check();
		expect(session.isRevealed).toBe(true);

		const answered = [...session.currentAnswer];
		session.select(3);
		expect(session.currentAnswer).toEqual(answered);
	});

	it('keeps a running tally of checked questions only', () => {
		expect(session.practiceTally).toEqual({ correct: 0, answered: 0 });
		answerCorrectly(session);
		session.check();
		expect(session.practiceTally).toEqual({ correct: 1, answered: 1 });
		session.next();
		expect(session.practiceTally).toEqual({ correct: 1, answered: 1 });
	});

	it('counts a wrong checked answer as answered but not correct', () => {
		const wrong = session.question?.options.findIndex((option) => !option.correct) ?? 1;
		session.select(wrong);
		if (session.requiredSelections > 1) {
			const second = session.question?.options.findIndex((o, i) => !o.correct && i !== wrong) ?? 2;
			session.select(second);
		}
		session.check();
		expect(session.practiceTally).toEqual({ correct: 0, answered: 1 });
	});
});

describe('the review grid distinguishes every state', () => {
	beforeEach(() => {
		session.load(MOCK, 'exam');
		session.start();
	});

	it('reports an untouched question as skipped', () => {
		expect(session.questionState(0)).toBe('blank');
	});

	it('reports a complete answer as answered before grading', () => {
		session.select(correctOptionFor(session));
		expect(session.questionState(0)).toBe('answered');
	});

	/** Half of a "Select TWO" scores zero, so it must read as incomplete, not answered. */
	it('reports a half-finished multi-answer question as incomplete', () => {
		const multi = session.questions.findIndex(
			(question) => question.options.filter((option) => option.correct).length > 1
		);
		session.goTo(multi);
		session.select(session.question?.options.findIndex((o) => o.correct) ?? 0);
		expect(session.questionState(multi)).toBe('partial');
	});

	it('withholds correct and wrong until the answer is actually knowable', () => {
		session.select(correctOptionFor(session));
		expect(session.questionState(0)).toBe('answered');
		expect(session.isGraded).toBe(false);
	});

	it('reports correct and wrong once graded', () => {
		session.questions.forEach((_question, index) => {
			session.goTo(index);
			if (index === 0) answerCorrectly(session);
		});
		session.submit();
		expect(session.isGraded).toBe(true);
		expect(session.questionState(0)).toBe('correct');
		expect(session.questionState(1)).toBe('blank');
	});

	/** Flagging is a separate axis: a flagged question can still be blank. */
	it('keeps flagging independent of the answer state', () => {
		session.flag();
		expect(session.questionState(0)).toBe('blank');
		expect(session.isCurrentFlagged).toBe(true);
		session.select(correctOptionFor(session));
		expect(session.questionState(0)).toBe('answered');
		expect(session.isCurrentFlagged).toBe(true);
	});
});

describe('submission', () => {
	it('grades, reports, and clears the saved attempt', () => {
		session.load(MOCK, 'exam');
		session.start();
		answerCorrectly(session);
		session.submit();

		expect(session.view).toBe('result');
		expect(session.result?.raw.total).toBe(4);
		expect(session.result?.raw.correct).toBe(1);
		expect(session.report?.score.true_percent).toBe(25);
		expect(backend.data[STORAGE_KEY]).toBeUndefined();
	});

	it('re-grades under a different strategy without re-sitting', () => {
		session.load(MOCK, 'exam');
		session.start();
		answerCorrectly(session);
		session.submit();

		const before = session.result?.verdict.percent;
		session.setStrategy('worst');
		expect(session.result?.verdict.strategy).toBe('worst');
		expect(session.result?.raw.correct).toBe(1);
		expect(session.result?.verdict.percent).not.toBe(undefined);
		expect(before).not.toBe(undefined);
	});

	it('counts what is still outstanding before submission', () => {
		session.load(MOCK, 'exam');
		session.start();
		expect(session.unansweredCount).toBe(4);
		answerCorrectly(session);
		expect(session.unansweredCount).toBe(3);
	});

	it('does nothing when there is nothing to submit', () => {
		session.submit();
		expect(session.view).toBe('home');
	});
});

describe('crash-safe resume', () => {
	it('saves after every meaningful action', () => {
		session.load(MOCK, 'exam');
		session.start();
		session.select(0);
		expect(backend.data[STORAGE_KEY]).toBeDefined();
	});

	it('restores answers, position and remaining time exactly', () => {
		session.load(MOCK, 'exam');
		session.start();
		const chosen = correctOptionFor(session);
		session.select(chosen);
		session.flag();
		session.next();
		vi.advanceTimersByTime(60_000);
		session.select(1);
		const remainingBefore = session.remaining;
		const stems = session.questions.map((question) => question.stem);

		const revived = new ExamSession(backend);
		revived.checkForResumable();
		expect(revived.resumable).not.toBeNull();
		revived.resume();

		expect(revived.view).toBe('exam');
		expect(revived.currentIndex).toBe(1);
		expect(revived.attempt?.answers[0]).toEqual([chosen]);
		expect(revived.attempt?.flags[0]).toBe(true);
		expect(revived.remaining).toBe(remainingBefore);
		// The seed is restored too, so the exam is presented in the same order.
		expect(revived.questions.map((question) => question.stem)).toEqual(stems);
		revived.dispose();
	});

	it('offers nothing to resume when the exam was submitted', () => {
		session.load(MOCK, 'exam');
		session.start();
		session.submit();

		const revived = new ExamSession(backend);
		revived.checkForResumable();
		expect(revived.resumable).toBeNull();
		revived.dispose();
	});

	it('discards a saved attempt on request', () => {
		session.load(MOCK, 'exam');
		session.start();
		session.select(0);

		const revived = new ExamSession(backend);
		revived.checkForResumable();
		revived.discardResumable();
		expect(revived.resumable).toBeNull();
		expect(backend.data[STORAGE_KEY]).toBeUndefined();
		revived.dispose();
	});

	it('works without storage at all', () => {
		const storageless = new ExamSession(null);
		storageless.load(MOCK, 'exam');
		storageless.start();
		storageless.select(0);
		storageless.checkForResumable();
		expect(storageless.resumable).toBeNull();
		expect(storageless.view).toBe('exam');
		storageless.dispose();
	});
});

describe('remembered preferences', () => {
	it('remembers the mode chosen last time', () => {
		session.load(MOCK, 'practice');
		expect(backend.data[PREFERENCES_KEY]).toBeDefined();

		const next = new ExamSession(backend);
		expect(next.mode).toBe('practice');
		next.dispose();
	});

	// Deliberately not the worst case: that is the default, so remembering it would prove
	// nothing about whether the choice actually round-trips.
	it('remembers the unscored strategy', () => {
		session.setStrategy('best');
		const next = new ExamSession(backend);
		expect(next.unscoredStrategy).toBe('best');
		next.dispose();
	});

	it('falls back to defaults when nothing is remembered', () => {
		const fresh = new ExamSession(makeBackend());
		expect(fresh.mode).toBe('exam');
		expect(fresh.config.passPercent).toBe(72);
		// The verdict is pessimistic until the candidate says otherwise.
		expect(fresh.unscoredStrategy).toBe('worst');
		fresh.dispose();
	});

	it('ignores corrupted preferences rather than failing to start', () => {
		const corrupt = makeBackend({ [PREFERENCES_KEY]: '{broken' });
		const fresh = new ExamSession(corrupt);
		expect(fresh.mode).toBe('exam');
		fresh.dispose();
	});
});

describe('reset', () => {
	it('returns to the home screen and clears everything', () => {
		session.load(MOCK, 'exam');
		session.start();
		session.select(0);
		session.reset();

		expect(session.view).toBe('home');
		expect(session.total).toBe(0);
		expect(session.attempt).toBeNull();
		expect(backend.data[STORAGE_KEY]).toBeUndefined();
	});

	it('stops the clock, so a reset session does not keep ticking', () => {
		session.load(MOCK, 'exam');
		session.start();
		session.reset();
		const before = session.now;
		vi.advanceTimersByTime(10_000);
		expect(session.now).toBe(before);
	});
});

describe('moving between the questions and the review screen', () => {
	beforeEach(() => {
		session.load(MOCK, 'exam');
		session.start();
	});

	it('opens the review screen and charges the time spent so far', () => {
		vi.advanceTimersByTime(15_000);
		session.showReview();
		expect(session.view).toBe('review');
		expect(session.attempt?.secondsOnQuestion[0]).toBe(15);
	});

	/** Time on the review screen belongs to no single question and must not be charged. */
	it('does not charge review-screen time to the question underneath', () => {
		session.showReview();
		vi.advanceTimersByTime(30_000);
		session.backToQuestions();
		vi.advanceTimersByTime(5_000);
		session.next();
		expect(session.attempt?.secondsOnQuestion[0]).toBe(5);
	});

	it('returns to a chosen question from the review screen', () => {
		session.showReview();
		session.goTo(2);
		expect(session.view).toBe('exam');
		expect(session.currentIndex).toBe(2);
	});

	it('steps back through the answers from the results', () => {
		session.goTo(3);
		session.submit();
		expect(session.view).toBe('result');
		session.reviewAnswers();
		expect(session.view).toBe('exam');
		expect(session.currentIndex).toBe(0);
	});
});

describe('question shape', () => {
	beforeEach(() => {
		session.load(MOCK, 'exam');
		session.start();
	});

	it('reports how many options a question expects', () => {
		expect(session.requiredSelections).toBe(1);
		expect(session.isMultiAnswer).toBe(false);
		session.goTo(3);
		expect(session.requiredSelections).toBe(2);
		expect(session.isMultiAnswer).toBe(true);
	});

	it('reports whether a question is fully answered', () => {
		expect(session.isQuestionAnswered(0)).toBe(false);
		session.select(0);
		expect(session.isQuestionAnswered(0)).toBe(true);
		session.goTo(3);
		session.select(0);
		expect(session.isQuestionAnswered(3)).toBe(false);
	});

	it('falls back safely when nothing is loaded', () => {
		const empty = new ExamSession(makeBackend());
		expect(empty.requiredSelections).toBe(1);
		expect(empty.question).toBeUndefined();
		expect(empty.questionState(0)).toBe('blank');
		expect(empty.isQuestionAnswered(0)).toBe(false);
		expect(empty.practiceTally).toEqual({ correct: 0, answered: 0 });
		expect(empty.unansweredCount).toBe(0);
		empty.dispose();
	});
});
