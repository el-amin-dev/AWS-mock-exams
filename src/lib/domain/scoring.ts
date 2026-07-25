import { WEAK_TOPIC_THRESHOLD } from './constants';
import { createRandom, sampleIndices } from './random';
import type {
	Attempt,
	ExamConfig,
	GroupBreakdown,
	Mock,
	Question,
	QuestionResult,
	ScaleConfig,
	ScoreBreakdown,
	ScoreResult,
	UnscoredStrategy,
	Verdict
} from './types';

/**
 * Grading.
 *
 * The engine reports three views of the same attempt, because a certification exam leaves a
 * share of its questions unscored and never says which:
 *
 * - **raw** — the honest result across every question. Always the headline.
 * - **worst** — the unscored slots fall on questions answered *correctly*, the least
 *   favourable arrangement that could possibly have occurred.
 * - **best** — they fall on questions answered *incorrectly*, the most favourable one.
 *
 * Together the last two bound what the real exam could have reported for the same answers,
 * which is the number worth training against.
 */

/** Indices of the options that must all be selected for the question to count as correct. */
export function correctOptionIndexes(question: Question): number[] {
	const indexes: number[] = [];
	question.options.forEach((option, index) => {
		if (option.correct) indexes.push(index);
	});
	return indexes;
}

/**
 * Grades one question, all or nothing.
 *
 * A multi-answer question scores zero unless every correct option is selected and no
 * incorrect one is — matching the real exam, which awards no partial credit.
 */
export function isAnswerCorrect(question: Question, selected: readonly number[]): boolean {
	const expected = correctOptionIndexes(question);
	if (selected.length !== expected.length || expected.length === 0) return false;
	const chosen = new Set(selected);
	return expected.every((index) => chosen.has(index));
}

/**
 * How many questions the unscored rule discards from a mock of `total` questions.
 *
 * Clamped so at least one question remains scored; without that guard, a pathological
 * ratio would leave nothing to divide by.
 */
export function unscoredCount(total: number, ratio: number): number {
	if (total <= 1) return 0;
	const raw = Math.round(total * ratio);
	return Math.max(0, Math.min(raw, total - 1));
}

/** Builds a tally, treating an empty pool as zero rather than as `NaN`. */
function breakdown(correct: number, total: number): ScoreBreakdown {
	const safeCorrect = Math.max(0, Math.min(correct, total));
	return {
		correct: safeCorrect,
		total,
		percent: total > 0 ? Math.round((safeCorrect / total) * 100) : 0
	};
}

/**
 * Maps a percentage onto the reported scaled score.
 *
 * Two linear segments meet at the pass mark, so the pass percentage always maps exactly to
 * `scale.pass`. This mirrors how certification scores are presented; it is an estimate, not
 * the real (undisclosed) scaling.
 */
export function scaledScore(percent: number, passPercent: number, scale: ScaleConfig): number {
	const clampedPass = Math.min(99, Math.max(1, passPercent));
	const value =
		percent >= clampedPass
			? scale.pass + ((percent - clampedPass) / (100 - clampedPass)) * (scale.max - scale.pass)
			: scale.min + (percent / clampedPass) * (scale.pass - scale.min);
	return Math.round(Math.min(scale.max, Math.max(scale.min, value)));
}

/**
 * The least favourable outcome: unscored slots land on correct answers first.
 *
 * Every discarded correct answer costs a mark from a pool that shrinks anyway, so this is
 * the floor of what the exam could have reported.
 */
function worstCase(correct: number, total: number, unscored: number): ScoreBreakdown {
	return breakdown(correct - Math.min(unscored, correct), total - unscored);
}

/**
 * The most favourable outcome: unscored slots land on wrong answers first.
 *
 * Only once every wrong answer has been absorbed do correct ones start being discarded,
 * which is why the surplus term appears.
 */
function bestCase(correct: number, total: number, unscored: number): ScoreBreakdown {
	const wrong = total - correct;
	const surplus = Math.max(0, unscored - wrong);
	return breakdown(correct - surplus, total - unscored);
}

/**
 * A seeded draw, mirroring how the real exam actually behaves.
 *
 * The seed lives on the attempt, so the same sitting always yields the same draw even
 * after a refresh — re-rolling here would let a candidate reload their way to a better
 * result.
 */
function randomCase(
	outcomes: readonly boolean[],
	unscored: number,
	seed: number
): { score: ScoreBreakdown; discarded: Set<number> } {
	const discarded = new Set(sampleIndices(outcomes.length, unscored, createRandom(seed)));
	let correct = 0;
	outcomes.forEach((wasCorrect, index) => {
		if (wasCorrect && !discarded.has(index)) correct++;
	});
	return { score: breakdown(correct, outcomes.length - discarded.size), discarded };
}

/** Aggregates results into named groups, preserving first-seen order. */
function groupBy(
	results: readonly QuestionResult[],
	key: (result: QuestionResult) => string | undefined,
	weights: ReadonlyMap<string, number>
): GroupBreakdown[] {
	const tallies = new Map<string, { correct: number; total: number }>();
	for (const result of results) {
		const name = key(result) ?? '(unlabelled)';
		const tally = tallies.get(name) ?? { correct: 0, total: 0 };
		tally.total++;
		if (result.outcome === 'correct') tally.correct++;
		tallies.set(name, tally);
	}
	return [...tallies].map(([name, tally]) => {
		const weight = weights.get(name);
		return {
			name,
			correct: tally.correct,
			total: tally.total,
			percent: Math.round((tally.correct / tally.total) * 100),
			...(weight === undefined ? {} : { weight })
		};
	});
}

/** Picks the percentage that decides pass or fail under the chosen strategy. */
function verdictFor(
	strategy: UnscoredStrategy,
	scores: Pick<ScoreResult, 'raw' | 'worst' | 'best' | 'random'>,
	config: ExamConfig
): Verdict {
	const source =
		strategy === 'worst'
			? scores.worst
			: strategy === 'best'
				? scores.best
				: strategy === 'random'
					? scores.random
					: scores.raw;
	return {
		strategy,
		percent: source.percent,
		passed: source.percent >= config.passPercent,
		scaled: scaledScore(source.percent, config.passPercent, config.scale)
	};
}

/**
 * Grades a completed attempt.
 *
 * @param mock Questions in the order they were presented.
 * @param attempt The candidate's answers, parallel to `mock.questions`.
 * @param config Exam shape; supplies the unscored ratio, pass mark and domain weights.
 * @param strategy Which unscored outcome decides the verdict. The raw score is reported
 *   regardless.
 */
export function scoreAttempt(
	mock: Mock,
	attempt: Attempt,
	config: ExamConfig,
	strategy: UnscoredStrategy
): ScoreResult {
	const questions = mock.questions;
	const total = questions.length;
	const unscored = unscoredCount(total, config.unscoredRatio);

	const outcomes = questions.map((question, index) =>
		isAnswerCorrect(question, attempt.answers[index] ?? [])
	);
	const correct = outcomes.filter(Boolean).length;

	const raw = breakdown(correct, total);
	const worst = worstCase(correct, total, unscored);
	const best = bestCase(correct, total, unscored);
	const { score: random, discarded } = randomCase(outcomes, unscored, attempt.seed);

	const results: QuestionResult[] = questions.map((question, index) => {
		const selected = attempt.answers[index] ?? [];
		const expected = correctOptionIndexes(question);
		return {
			position: index + 1,
			topic: question.topic,
			domain: question.domain,
			type: expected.length > 1 ? 'multi' : 'single',
			outcome: selected.length === 0 ? 'blank' : outcomes[index] ? 'correct' : 'wrong',
			selected,
			correctOptions: expected,
			secondsSpent: attempt.secondsOnQuestion[index] ?? 0,
			flagged: attempt.flags[index] ?? false,
			unscored: strategy === 'random' && discarded.has(index)
		};
	});

	const weights = new Map(config.domains.map((domain) => [domain.name, domain.weight]));
	const byTopic = groupBy(results, (result) => result.topic, new Map());
	const byDomain = groupBy(results, (result) => result.domain, weights);

	return {
		raw,
		unscoredCount: unscored,
		worst,
		best,
		random,
		verdict: verdictFor(strategy, { raw, worst, best, random }, config),
		questions: results,
		byTopic,
		byDomain,
		weakTopics: byTopic
			.filter((topic) => topic.correct / topic.total < WEAK_TOPIC_THRESHOLD)
			.map((topic) => topic.name)
	};
}
