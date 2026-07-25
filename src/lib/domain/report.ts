import { SLOW_QUESTION_SECONDS } from './constants';
import { OPTION_LABELS } from './validation';
import type { Attempt, ExamConfig, Mock, ScoreResult } from './types';

/**
 * The machine-readable result summary.
 *
 * This is the only artefact that crosses back out of the engine: the candidate pastes it
 * into a generator so the next mock can retest whatever went badly. Its shape is therefore
 * a published contract — fields may be added, but renaming or removing one breaks every
 * saved report.
 *
 * It deliberately contains no course, provider or tool names.
 */

/** How one question was answered, in the report's flattened form. */
export interface ReportQuestion {
	readonly position: number;
	readonly topic: string;
	readonly domain: string | undefined;
	readonly type: 'single' | 'multi';
	readonly result: 'correct' | 'wrong' | 'blank';
	readonly your_answer: readonly string[];
	readonly correct_answer: readonly string[];
	readonly seconds_spent: number;
	readonly flagged: boolean;
}

/** Pacing signals, which are usually more actionable than the score itself. */
export interface ReportPacing {
	readonly average_seconds_per_question: number;
	readonly budget_seconds_per_question: number;
	/** Positions of questions that ran long enough to threaten the time budget. */
	readonly slow_questions: readonly number[];
}

/** The complete report. */
export interface Report {
	readonly exam_id: string;
	readonly date: string;
	readonly mode: string;
	readonly started_at: string;
	readonly topics_covered: readonly string[];
	readonly score: {
		/** The honest result across every question. */
		readonly true_percent: number;
		readonly correct: number;
		readonly total: number;
		/** Bounds of what the exam could have reported once unscored items are applied. */
		readonly unscored_range: { readonly worst: number; readonly best: number };
		readonly unscored_count: number;
		readonly verdict_strategy: string;
		readonly verdict_percent: number;
		readonly scaled: number;
		readonly passed: boolean;
	};
	readonly time: { readonly allotted_seconds: number; readonly used_seconds: number };
	readonly pacing: ReportPacing;
	readonly by_topic: Readonly<Record<string, { correct: number; total: number; percent: number }>>;
	readonly by_domain: Readonly<Record<string, { correct: number; total: number; percent: number }>>;
	readonly weak_topics: readonly string[];
	readonly questions: readonly ReportQuestion[];
	/** Instruction to whatever generates the next mock. */
	readonly note_to_generator: string;
}

const NOTE_TO_GENERATOR =
	'Weight the next mock using weak_topics together with any wrong or blank questions. ' +
	'Mix a small number of review questions on those weak concepts into an otherwise new ' +
	'mock scoped to the next topics. Test the underlying concept rather than reusing wording.';

function toLabels(indexes: readonly number[]): string[] {
	return indexes.map((index) => OPTION_LABELS[index] ?? String(index + 1));
}

function toRecord(
	groups: ScoreResult['byTopic']
): Record<string, { correct: number; total: number; percent: number }> {
	return Object.fromEntries(
		groups.map((group) => [
			group.name,
			{ correct: group.correct, total: group.total, percent: group.percent }
		])
	);
}

/**
 * Builds the report for a graded attempt.
 *
 * @param usedSeconds Wall-clock time actually spent, which is authoritative — the
 *   per-question totals exclude time spent on the review screen and so do not sum to it.
 */
export function buildReport(
	mock: Mock,
	attempt: Attempt,
	score: ScoreResult,
	config: ExamConfig,
	usedSeconds: number
): Report {
	const total = score.raw.total;
	const topics =
		mock.topics_covered && mock.topics_covered.length > 0
			? [...mock.topics_covered]
			: score.byTopic.map((topic) => topic.name);

	return {
		exam_id: mock.exam_id ?? 'mock',
		date: mock.date ?? attempt.startedAt.slice(0, 10),
		mode: attempt.mode,
		started_at: attempt.startedAt,
		topics_covered: topics,
		score: {
			true_percent: score.raw.percent,
			correct: score.raw.correct,
			total,
			unscored_range: { worst: score.worst.percent, best: score.best.percent },
			unscored_count: score.unscoredCount,
			verdict_strategy: score.verdict.strategy,
			verdict_percent: score.verdict.percent,
			scaled: score.verdict.scaled,
			passed: score.verdict.passed
		},
		time: {
			allotted_seconds: total * config.secondsPerQuestion,
			used_seconds: usedSeconds
		},
		pacing: {
			average_seconds_per_question: total > 0 ? Math.round(usedSeconds / total) : 0,
			budget_seconds_per_question: config.secondsPerQuestion,
			slow_questions: score.questions
				.filter((question) => question.secondsSpent > SLOW_QUESTION_SECONDS)
				.map((question) => question.position)
		},
		by_topic: toRecord(score.byTopic),
		by_domain: toRecord(score.byDomain),
		weak_topics: score.weakTopics,
		questions: score.questions.map((question) => ({
			position: question.position,
			topic: question.topic,
			domain: question.domain,
			type: question.type,
			result: question.outcome,
			your_answer: toLabels(question.selected),
			correct_answer: toLabels(question.correctOptions),
			seconds_spent: question.secondsSpent,
			flagged: question.flagged
		})),
		note_to_generator: NOTE_TO_GENERATOR
	};
}
