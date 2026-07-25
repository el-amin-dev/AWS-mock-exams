import type { Report } from '../domain/report';
import {
	buildPrompt,
	defaultMultiAnswerCount,
	normalisePromptOptions,
	weakTopicsFrom
} from '../prompt/builder';
import type { Difficulty } from '../prompt/sections';
import { parseTopics } from '../prompt/topics';
import { defaultBackend, type StorageBackend } from '../session/storage';
import { DEFAULT_STUDIO_STATE, loadStudio, saveStudio, type StudioState } from '../session/studio';
import { DEFAULT_EXAM_CONFIG } from '../domain/constants';
import type { ExamConfig } from '../domain/types';

/**
 * The prompt studio's live state.
 *
 * Thin by design: it holds what the candidate has typed, delegates every decision about
 * wording to `prompt/`, and writes through to storage on every change so nothing is lost to
 * a refresh or a closed tab.
 */
export class PromptStudio {
	topicsText = $state(DEFAULT_STUDIO_STATE.topicsText);
	questionCount = $state(DEFAULT_STUDIO_STATE.questionCount);
	multiAnswerCountOverride = $state<number | null>(DEFAULT_STUDIO_STATE.multiAnswerCountOverride);
	difficulty = $state<Difficulty>(DEFAULT_STUDIO_STATE.difficulty);
	reviewQuestionCount = $state(DEFAULT_STUDIO_STATE.reviewQuestionCount);
	/** The most recent graded report, whose weak topics feed the next prompt. */
	lastReport = $state<Report | null>(null);
	config = $state<ExamConfig>(DEFAULT_EXAM_CONFIG);

	#backend: StorageBackend | null;

	constructor(backend: StorageBackend | null = defaultBackend()) {
		this.#backend = backend;
		this.#apply(loadStudio(backend));
	}

	#apply(state: StudioState): void {
		this.topicsText = state.topicsText;
		this.questionCount = state.questionCount;
		this.multiAnswerCountOverride = state.multiAnswerCountOverride;
		this.difficulty = state.difficulty;
		this.reviewQuestionCount = state.reviewQuestionCount;
		this.lastReport = state.lastReport;
	}

	/**
	 * How many multi-answer questions to ask for.
	 *
	 * Derived from the question count so a shorter mock keeps the real exam's proportions,
	 * unless an explicit count has been set.
	 */
	get multiAnswerCount() {
		return this.multiAnswerCountOverride ?? defaultMultiAnswerCount(this.questionCount);
	}

	set multiAnswerCount(value: number) {
		this.multiAnswerCountOverride = value;
	}

	/** Whether the multi-answer count is following the question count. */
	get multiAnswerIsAutomatic() {
		return this.multiAnswerCountOverride === null;
	}

	/** Returns the multi-answer count to following the question count. */
	resetMultiAnswerCount(): void {
		this.multiAnswerCountOverride = null;
		this.persist();
	}

	/** The topics as parsed from whatever was pasted. */
	get topics() {
		return parseTopics(this.topicsText);
	}

	/** Topics that scored below the pass mark last time. */
	get weakTopics() {
		return weakTopicsFrom(this.lastReport);
	}

	get hasTopics() {
		return this.topics.length > 0;
	}

	/** The prompt, rebuilt from the current state. */
	get prompt() {
		return buildPrompt(
			normalisePromptOptions({
				topics: this.topics,
				questionCount: this.questionCount,
				multiAnswerCount: this.multiAnswerCount,
				difficulty: this.difficulty,
				config: this.config,
				weakTopics: this.weakTopics,
				reviewQuestionCount: this.reviewQuestionCount
			})
		);
	}

	/** Warns about a combination that would produce a self-contradictory prompt. */
	get warning(): string | null {
		if (this.multiAnswerCount > this.questionCount) {
			return 'There cannot be more multi-answer questions than questions; the prompt will ask for fewer.';
		}
		if (this.weakTopics.length > 0 && this.reviewQuestionCount > this.questionCount) {
			return 'There cannot be more review questions than questions; the prompt will ask for fewer.';
		}
		return null;
	}

	/** Records a graded report so the next prompt retests what went badly. */
	recordReport(report: Report): void {
		this.lastReport = report;
		this.persist();
	}

	/** Writes the current state through to storage. */
	persist(): void {
		saveStudio(this.#backend, {
			topicsText: this.topicsText,
			questionCount: this.questionCount,
			multiAnswerCountOverride: this.multiAnswerCountOverride,
			difficulty: this.difficulty,
			reviewQuestionCount: this.reviewQuestionCount,
			lastReport: this.lastReport
		});
	}

	/** Forgets the carried-forward report, so the next prompt covers new topics only. */
	forgetLastReport(): void {
		this.lastReport = null;
		this.persist();
	}
}
