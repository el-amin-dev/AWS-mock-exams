import { DEFAULT_EXAM_CONFIG, DEFAULT_UNSCORED_STRATEGY } from '../domain/constants';
import { buildReport, type Report } from '../domain/report';
import { correctOptionIndexes, scoreAttempt } from '../domain/scoring';
import {
	elapsedSeconds,
	hasExpired,
	remainingSeconds,
	startStopwatch,
	totalTimeSeconds,
	type Stopwatch
} from '../domain/timer';
import type {
	Attempt,
	ExamConfig,
	ExamMode,
	Mock,
	ScoreResult,
	UnscoredStrategy
} from '../domain/types';
import { createSeed } from '../domain/random';
import { nowIso, nowMs } from '../session/clock';
import { loadPreferences, savePreferences, type Preferences } from '../session/preferences';
import {
	checkQuestion,
	countUnanswered,
	createAttempt,
	isAnswered,
	prepareMock,
	recordTime,
	selectOption,
	toggleFlag,
	toggleStrike,
	type PreparedMock
} from '../session/attempt';
import {
	clearAttempt,
	defaultBackend,
	loadAttempt,
	saveAttempt,
	type PersistedAttempt,
	type StorageBackend
} from '../session/storage';

/**
 * The live exam session.
 *
 * This is the only stateful, reactive part of the engine. It owns *when* things happen —
 * navigation, the clock, persistence — and delegates *what* they mean to the pure modules
 * in `domain/` and `session/`. Nothing here re-implements a rule.
 *
 * Time is never accumulated by counting ticks. `now` is refreshed by an interval purely so
 * the display repaints; every duration is computed from wall-clock timestamps.
 */

/** Which screen is showing. */
export type SessionView = 'home' | 'ready' | 'exam' | 'review' | 'result';

/** Seconds remaining at which the countdown starts warning. */
const LOW_TIME_SECONDS = 120;

export class ExamSession {
	/* ----- persistent-ish configuration ----- */
	config = $state<ExamConfig>(DEFAULT_EXAM_CONFIG);
	unscoredStrategy = $state<UnscoredStrategy>(DEFAULT_UNSCORED_STRATEGY);

	/* ----- session state ----- */
	view = $state<SessionView>('home');
	mode = $state<ExamMode>('exam');
	prepared = $state<PreparedMock | null>(null);
	attempt = $state<Attempt | null>(null);
	currentIndex = $state(0);
	stopwatch = $state<Stopwatch | null>(null);
	now = $state(nowMs());
	result = $state<ScoreResult | null>(null);
	report = $state<Report | null>(null);
	/** A saved attempt found at startup, offered for resume. */
	resumable = $state<PersistedAttempt | null>(null);

	#backend: StorageBackend | null;
	#questionEnteredAtMs = 0;
	#ticker: ReturnType<typeof setInterval> | null = null;

	constructor(backend: StorageBackend | null = defaultBackend()) {
		this.#backend = backend;
		this.#applyPreferences(loadPreferences(backend));
	}

	/** Applies remembered choices over the defaults. */
	#applyPreferences(preferences: Preferences): void {
		this.mode = preferences.mode;
		this.unscoredStrategy = preferences.unscoredStrategy;
		this.config = {
			...this.config,
			...(preferences.passPercent === undefined ? {} : { passPercent: preferences.passPercent }),
			...(preferences.secondsPerQuestion === undefined
				? {}
				: { secondsPerQuestion: preferences.secondsPerQuestion })
		};
	}

	/** Records the current choices so the next sitting starts where this one left off. */
	#rememberPreferences(): void {
		savePreferences(this.#backend, {
			mode: this.mode,
			unscoredStrategy: this.unscoredStrategy,
			passPercent: this.config.passPercent,
			secondsPerQuestion: this.config.secondsPerQuestion
		});
	}

	/* ----- derived ----- */

	get questions() {
		return this.prepared?.questions ?? [];
	}

	get total() {
		return this.questions.length;
	}

	get question() {
		return this.questions[this.currentIndex];
	}

	/** How many options this question expects, driving single versus multiple selection. */
	get requiredSelections() {
		const question = this.question;
		return question ? correctOptionIndexes(question).length : 1;
	}

	get isMultiAnswer() {
		return this.requiredSelections > 1;
	}

	get timeLimitSeconds() {
		return totalTimeSeconds(this.total, this.config.secondsPerQuestion);
	}

	get elapsed() {
		return this.stopwatch ? elapsedSeconds(this.stopwatch, this.now) : 0;
	}

	get remaining() {
		return this.stopwatch ? remainingSeconds(this.stopwatch, this.now, this.timeLimitSeconds) : 0;
	}

	/** Exam mode counts down; practice mode counts up and is never cut short. */
	get displaySeconds() {
		return this.mode === 'exam' ? this.remaining : this.elapsed;
	}

	get isLowOnTime() {
		return (
			this.mode === 'exam' &&
			this.remaining <= Math.min(LOW_TIME_SECONDS, this.timeLimitSeconds * 0.1)
		);
	}

	/** Practice mode reveals a question once it has been checked. */
	get isRevealed() {
		return this.mode === 'practice' && (this.attempt?.checked[this.currentIndex] ?? false);
	}

	get currentAnswer() {
		return this.attempt?.answers[this.currentIndex] ?? [];
	}

	get currentStruck() {
		return this.attempt?.struck[this.currentIndex] ?? [];
	}

	get isCurrentFlagged() {
		return this.attempt?.flags[this.currentIndex] ?? false;
	}

	get canCheck() {
		return (
			this.mode === 'practice' &&
			!this.isRevealed &&
			this.currentAnswer.length === this.requiredSelections
		);
	}

	/** Running tally shown in practice mode, where feedback is immediate. */
	get practiceTally() {
		const attempt = this.attempt;
		if (!attempt) return { correct: 0, answered: 0 };
		let correct = 0;
		let answered = 0;
		this.questions.forEach((question, index) => {
			if (!attempt.checked[index]) return;
			answered++;
			const expected = correctOptionIndexes(question);
			const selected = attempt.answers[index] ?? [];
			if (selected.length === expected.length && expected.every((i) => selected.includes(i))) {
				correct++;
			}
		});
		return { correct, answered };
	}

	get unansweredCount() {
		return this.attempt ? countUnanswered(this.attempt, this.questions) : 0;
	}

	get flaggedCount() {
		return this.attempt?.flags.filter(Boolean).length ?? 0;
	}

	isQuestionAnswered(index: number): boolean {
		const question = this.questions[index];
		if (!this.attempt || !question) return false;
		return isAnswered(this.attempt, index, correctOptionIndexes(question).length);
	}

	/**
	 * A question's answer state, for the review grid.
	 *
	 * Deliberately independent of whether the question is flagged: flagging is a note to
	 * self about a question, not a statement about the answer, and a candidate needs to see
	 * both at once — "flagged *and* still blank" is the case worth catching before time runs
	 * out. Correct and wrong only appear once the answer is actually known, which means
	 * after submission in exam mode and after Check in practice mode.
	 */
	questionState(index: number): 'correct' | 'wrong' | 'blank' | 'answered' | 'partial' {
		const question = this.questions[index];
		if (!this.attempt || !question) return 'blank';

		const selected = this.attempt.answers[index] ?? [];
		if (selected.length === 0) return 'blank';

		const expected = correctOptionIndexes(question);
		const graded =
			this.view === 'result' || (this.mode === 'practice' && this.attempt.checked[index]);
		if (!graded) return selected.length === expected.length ? 'answered' : 'partial';

		const right =
			selected.length === expected.length && expected.every((option) => selected.includes(option));
		return right ? 'correct' : 'wrong';
	}

	/** Whether any answer is yet knowable, which decides the review grid's legend. */
	get isGraded() {
		return (
			this.view === 'result' ||
			(this.mode === 'practice' && (this.attempt?.checked.some(Boolean) ?? false))
		);
	}

	/* ----- lifecycle ----- */

	/** Looks for a saved attempt to offer at startup. */
	checkForResumable(): void {
		this.resumable = loadAttempt(this.#backend);
	}

	/** Loads a validated mock and moves to the pre-start screen. */
	load(mock: Mock, mode: ExamMode): void {
		const seed = createSeed();
		this.mode = mode;
		this.prepared = prepareMock(mock, seed);
		this.attempt = createAttempt(mock.questions.length, mode, nowIso(), seed);
		this.currentIndex = 0;
		this.result = null;
		this.report = null;
		this.view = 'ready';
		this.#rememberPreferences();
	}

	/** Starts the clock. Nothing is timed until this is called. */
	start(): void {
		if (!this.attempt) return;
		this.now = nowMs();
		this.stopwatch = startStopwatch(this.now);
		this.#questionEnteredAtMs = this.now;
		this.view = 'exam';
		this.#startTicking();
		this.#persist();
	}

	/** Restores a saved attempt exactly, including its remaining time. */
	resume(): void {
		const saved = this.resumable;
		if (!saved) return;
		this.mode = saved.mode;
		this.prepared = prepareMock(saved.mock, saved.attempt.seed);
		this.attempt = saved.attempt;
		this.stopwatch = saved.stopwatch;
		this.currentIndex = saved.currentIndex;
		this.now = nowMs();
		this.#questionEnteredAtMs = this.now;
		this.resumable = null;
		this.view = 'exam';
		this.#startTicking();
	}

	/** Abandons a saved attempt. */
	discardResumable(): void {
		this.resumable = null;
		clearAttempt(this.#backend);
	}

	/* ----- interactions ----- */

	select(optionIndex: number): void {
		if (!this.attempt || this.isRevealed) return;
		this.attempt = selectOption(
			this.attempt,
			this.currentIndex,
			optionIndex,
			this.requiredSelections
		);
		this.#persist();
	}

	strike(optionIndex: number): void {
		if (!this.attempt || this.isRevealed) return;
		this.attempt = toggleStrike(this.attempt, this.currentIndex, optionIndex);
		this.#persist();
	}

	flag(): void {
		if (!this.attempt) return;
		this.attempt = toggleFlag(this.attempt, this.currentIndex);
		this.#persist();
	}

	/** Practice mode: grades and reveals the current question, irreversibly. */
	check(): void {
		if (!this.attempt || !this.canCheck) return;
		this.attempt = checkQuestion(this.attempt, this.currentIndex);
		this.#persist();
	}

	goTo(index: number): void {
		if (index < 0 || index >= this.total || index === this.currentIndex) return;
		this.#accrueTime();
		this.currentIndex = index;
		this.view = 'exam';
		this.#persist();
	}

	next(): void {
		this.goTo(this.currentIndex + 1);
	}

	previous(): void {
		this.goTo(this.currentIndex - 1);
	}

	showReview(): void {
		this.#accrueTime();
		this.view = 'review';
		this.#persist();
	}

	backToQuestions(): void {
		this.#questionEnteredAtMs = nowMs();
		this.view = 'exam';
	}

	/* ----- submission ----- */

	/** Grades the attempt, builds the report, and ends the sitting. */
	submit(): void {
		const prepared = this.prepared;
		if (!prepared || !this.attempt) return;

		// Refresh the clock before reading it: the ticker only samples once a second, so the
		// recorded time would otherwise be up to a second short.
		this.now = nowMs();
		this.#accrueTime();
		this.#stopTicking();

		// `#accrueTime` replaces the attempt, so this must be read after it, not before.
		const attempt = this.attempt;
		const presented: Mock = { ...prepared.mock, questions: prepared.questions };
		const graded = scoreAttempt(presented, attempt, this.config, this.unscoredStrategy);

		this.result = graded;
		this.report = buildReport(
			presented,
			attempt,
			graded,
			this.config,
			this.mode === 'exam' ? this.timeLimitSeconds - this.remaining : this.elapsed
		);
		this.view = 'result';
		clearAttempt(this.#backend);
	}

	/** Re-grades an existing result under a different strategy, without re-sitting. */
	setStrategy(strategy: UnscoredStrategy): void {
		this.unscoredStrategy = strategy;
		if (this.prepared && this.attempt && this.result) {
			const presented: Mock = { ...this.prepared.mock, questions: this.prepared.questions };
			this.result = scoreAttempt(presented, this.attempt, this.config, strategy);
		}
		this.#rememberPreferences();
	}

	/** Returns to the results after stepping back through the answered questions. */
	reviewAnswers(): void {
		this.currentIndex = 0;
		this.view = 'exam';
	}

	/** Clears everything and returns to the home screen. */
	reset(): void {
		this.#stopTicking();
		this.prepared = null;
		this.attempt = null;
		this.stopwatch = null;
		this.result = null;
		this.report = null;
		this.currentIndex = 0;
		this.view = 'home';
		clearAttempt(this.#backend);
	}

	/** Stops the ticker. Must be called when the component using this is destroyed. */
	dispose(): void {
		this.#stopTicking();
	}

	/* ----- internals ----- */

	#startTicking(): void {
		this.#stopTicking();
		this.#ticker = setInterval(() => {
			this.now = nowMs();
			// Exam mode is the only mode with a deadline; practice is never cut short.
			if (
				this.mode === 'exam' &&
				this.stopwatch &&
				hasExpired(this.stopwatch, this.now, this.timeLimitSeconds)
			) {
				this.submit();
			}
		}, 1000);
	}

	#stopTicking(): void {
		if (this.#ticker !== null) {
			clearInterval(this.#ticker);
			this.#ticker = null;
		}
	}

	/** Charges wall-clock time on the question being left to that question. */
	#accrueTime(): void {
		if (!this.attempt) return;
		const now = nowMs();
		const seconds = (now - this.#questionEnteredAtMs) / 1000;
		this.#questionEnteredAtMs = now;
		this.attempt = recordTime(this.attempt, this.currentIndex, seconds);
	}

	#persist(): void {
		if (!this.prepared || !this.attempt || !this.stopwatch) return;
		saveAttempt(
			this.#backend,
			{
				mock: this.prepared.mock,
				attempt: this.attempt,
				stopwatch: this.stopwatch,
				mode: this.mode,
				currentIndex: this.currentIndex
			},
			nowIso()
		);
	}
}
