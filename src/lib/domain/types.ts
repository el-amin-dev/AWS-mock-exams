/**
 * Domain vocabulary for the exam engine.
 *
 * Two families of type live here and must not be confused:
 *
 * - **Mock types** (`Mock`, `Question`, `Option`) describe the JSON a generator produces.
 *   They arrive from outside the application and are therefore untrusted until
 *   {@link ValidationResult} says otherwise.
 * - **Engine types** (`ExamConfig`, `Attempt`, `ScoreResult`) describe how the engine
 *   presents and grades that content. They are always constructed internally.
 */

/** One selectable answer, with the explanation shown after grading. */
export interface Option {
	/** Answer text shown to the candidate. */
	readonly text: string;
	/** Whether selecting this option contributes to a correct answer. */
	readonly correct: boolean;
	/** Why this option is right or wrong; revealed after the question is graded. */
	readonly why: string;
}

/** A single exam item. */
export interface Question {
	/** Short label for the concept under test; drives weak-topic detection. */
	readonly topic: string;
	/** Optional exam domain label, matched against {@link ExamConfig.domains}. */
	readonly domain?: string;
	/** Self-contained scenario. Must be answerable without seeing `topic` or `domain`. */
	readonly stem: string;
	readonly options: readonly Option[];
}

/** Per-mock overrides supplied by the generator. */
export interface MockConfig {
	readonly seconds_per_question?: number;
	readonly pass_percent?: number;
	readonly randomize_questions?: boolean;
	readonly randomize_options?: boolean;
}

/** A complete generated mock exam. */
export interface Mock {
	readonly exam_id?: string;
	readonly date?: string;
	readonly title?: string;
	readonly subtitle?: string;
	readonly topics_covered?: readonly string[];
	readonly config?: MockConfig;
	readonly questions: readonly Question[];
}

/** An exam domain and its share of the real exam. */
export interface DomainWeight {
	readonly name: string;
	/** Percentage of the real exam, 0–100. Zero means "reported but unweighted". */
	readonly weight: number;
}

/** Mapping from a percentage to the reported scaled score. */
export interface ScaleConfig {
	readonly min: number;
	readonly max: number;
	/** Scaled value that corresponds exactly to {@link ExamConfig.passPercent}. */
	readonly pass: number;
}

/** How the engine presents and grades an attempt. */
export interface ExamConfig {
	/** Questions in a full-length exam; a mock may be shorter. */
	readonly questionCount: number;
	/** Share of questions that do not count toward the result. */
	readonly unscoredRatio: number;
	readonly secondsPerQuestion: number;
	/** Percentage of *scored* questions required to pass. */
	readonly passPercent: number;
	readonly scale: ScaleConfig;
	readonly domains: readonly DomainWeight[];
	/** Expected option count when exactly one option is correct. */
	readonly singleAnswerOptionCount: number;
	/** Expected option count when more than one option is correct. */
	readonly multiAnswerOptionCount: number;
}

/** How a sitting is conducted. */
export type ExamMode =
	/** Blind until submission, counting down, auto-submitted when time expires. */
	| 'exam'
	/** Graded question by question on demand, counting up, never auto-submitted. */
	| 'practice';

/**
 * Which unscored-question outcome decides pass or fail.
 *
 * The true score is always reported; this only chooses the verdict basis.
 */
export type UnscoredStrategy =
	/** Ignore the unscored mechanic; judge on the true score. */
	| 'off'
	/** Discard a seeded random selection, as the real exam effectively does. */
	| 'random'
	/** Discard correct answers first — the least favourable outcome possible. */
	| 'worst'
	/** Discard incorrect answers first — the most favourable outcome possible. */
	| 'best';

/** A candidate's in-progress or completed sitting. */
export interface Attempt {
	readonly mode: ExamMode;
	/** ISO-8601 timestamp of the moment the exam started. */
	readonly startedAt: string;
	/** Seed for every randomised decision, so a resumed attempt is identical. */
	readonly seed: number;
	/** Selected option indices per question, in presentation order. */
	readonly answers: readonly (readonly number[])[];
	readonly flags: readonly boolean[];
	/** Option indices struck out by the candidate as elimination aids. */
	readonly struck: readonly (readonly number[])[];
	readonly secondsOnQuestion: readonly number[];
	/** Practice mode only: whether the question has been graded and revealed. */
	readonly checked: readonly boolean[];
}

/** A correct-out-of-total tally and its percentage. */
export interface ScoreBreakdown {
	readonly correct: number;
	readonly total: number;
	/** Rounded to the nearest whole percent. */
	readonly percent: number;
}

/** How one question was answered. */
export type QuestionOutcome = 'correct' | 'wrong' | 'blank';

/** Per-question grading detail, used for the report and the review screen. */
export interface QuestionResult {
	readonly position: number;
	readonly topic: string;
	readonly domain: string | undefined;
	readonly type: 'single' | 'multi';
	readonly outcome: QuestionOutcome;
	readonly selected: readonly number[];
	readonly correctOptions: readonly number[];
	readonly secondsSpent: number;
	readonly flagged: boolean;
	/** True when this question was drawn as unscored under the active strategy. */
	readonly unscored: boolean;
}

/** An aggregate tally for one topic or one domain. */
export interface GroupBreakdown {
	readonly name: string;
	readonly correct: number;
	readonly total: number;
	readonly percent: number;
	/** Exam weight, present only for domains declared in {@link ExamConfig.domains}. */
	readonly weight?: number;
}

/** The verdict actually shown to the candidate. */
export interface Verdict {
	readonly strategy: UnscoredStrategy;
	readonly percent: number;
	readonly passed: boolean;
	readonly scaled: number;
}

/** The complete outcome of a graded attempt. */
export interface ScoreResult {
	/** The honest score over every question. Always the headline figure. */
	readonly raw: ScoreBreakdown;
	/** How many questions the unscored rule discards. */
	readonly unscoredCount: number;
	/** Least favourable outcome: correct answers discarded first. */
	readonly worst: ScoreBreakdown;
	/** Most favourable outcome: incorrect answers discarded first. */
	readonly best: ScoreBreakdown;
	/** Seeded random draw, mirroring how the real exam behaves. */
	readonly random: ScoreBreakdown;
	readonly verdict: Verdict;
	readonly questions: readonly QuestionResult[];
	readonly byTopic: readonly GroupBreakdown[];
	readonly byDomain: readonly GroupBreakdown[];
	/** Topics scoring below the pass mark, driving the next mock's review weighting. */
	readonly weakTopics: readonly string[];
}
