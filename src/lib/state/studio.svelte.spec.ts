import { describe, expect, it } from 'vitest';

import type { Report } from '../domain/report';
import { STUDIO_KEY } from '../session/studio';
import type { StorageBackend } from '../session/storage';
import { PromptStudio } from './studio.svelte';

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

const REPORT = {
	weak_topics: ['VPC routing'],
	score: { true_percent: 60 }
} as unknown as Report;

describe('PromptStudio', () => {
	it('parses whatever was pasted into topics', () => {
		const studio = new PromptStudio(makeBackend());
		studio.topicsText = '1. VPC routing\n- EBS volumes\n\n';
		expect(studio.topics).toEqual(['VPC routing', 'EBS volumes']);
		expect(studio.hasTopics).toBe(true);
	});

	it('reports having no topics before anything is pasted', () => {
		expect(new PromptStudio(makeBackend()).hasTopics).toBe(false);
	});

	it('builds a prompt containing the pasted topics', () => {
		const studio = new PromptStudio(makeBackend());
		studio.topicsText = 'S3 lifecycle';
		expect(studio.prompt).toContain('- S3 lifecycle');
		expect(studio.prompt).toContain('# ROLE');
	});

	it('rebuilds the prompt as the shape changes', () => {
		const studio = new PromptStudio(makeBackend());
		studio.topicsText = 'S3 lifecycle';
		studio.questionCount = 25;
		expect(studio.prompt).toContain('EXACTLY 25 questions');
	});
});

describe('PromptStudio — carrying results forward', () => {
	it('has no weak topics before anything has been sat', () => {
		expect(new PromptStudio(makeBackend()).weakTopics).toEqual([]);
	});

	/** The point of the loop: yesterday's weak spots become today's review questions. */
	it('surfaces weak topics from a recorded report', () => {
		const studio = new PromptStudio(makeBackend());
		studio.topicsText = 'S3 lifecycle';
		studio.recordReport(REPORT);
		expect(studio.weakTopics).toEqual(['VPC routing']);
		expect(studio.prompt).toContain('VPC routing');
		expect(studio.prompt).toContain('review question');
	});

	it('forgets a recorded report on request', () => {
		const studio = new PromptStudio(makeBackend());
		studio.recordReport(REPORT);
		studio.forgetLastReport();
		expect(studio.weakTopics).toEqual([]);
	});

	it('persists a recorded report so it survives a reload', () => {
		const backend = makeBackend();
		new PromptStudio(backend).recordReport(REPORT);
		expect(new PromptStudio(backend).weakTopics).toEqual(['VPC routing']);
	});
});

describe('PromptStudio — persistence', () => {
	it('writes through on persist', () => {
		const backend = makeBackend();
		const studio = new PromptStudio(backend);
		studio.topicsText = 'VPC routing';
		studio.persist();
		expect(backend.data[STUDIO_KEY]).toContain('VPC routing');
	});

	it('restores what was typed last time', () => {
		const backend = makeBackend();
		const first = new PromptStudio(backend);
		first.topicsText = 'IAM roles';
		first.difficulty = 'brutal';
		first.questionCount = 30;
		first.persist();

		const second = new PromptStudio(backend);
		expect(second.topicsText).toBe('IAM roles');
		expect(second.difficulty).toBe('brutal');
		expect(second.questionCount).toBe(30);
	});

	it('works without storage at all', () => {
		const studio = new PromptStudio(null);
		studio.topicsText = 'VPC routing';
		expect(() => studio.persist()).not.toThrow();
		expect(studio.prompt).toContain('VPC routing');
	});
});

describe('PromptStudio — warnings', () => {
	it('stays quiet for a coherent set', () => {
		const studio = new PromptStudio(makeBackend());
		studio.questionCount = 10;
		studio.multiAnswerCount = 2;
		expect(studio.warning).toBeNull();
	});

	it('warns when more multi-answer questions are asked for than exist', () => {
		const studio = new PromptStudio(makeBackend());
		studio.questionCount = 5;
		studio.multiAnswerCount = 9;
		expect(studio.warning).toContain('more multi-answer questions than questions');
	});

	it('warns when more review questions are asked for than exist', () => {
		const studio = new PromptStudio(makeBackend());
		studio.recordReport(REPORT);
		studio.questionCount = 3;
		studio.multiAnswerCount = 0;
		studio.reviewQuestionCount = 8;
		expect(studio.warning).toContain('more review questions than questions');
	});

	it('does not warn about review questions when there are no weak topics', () => {
		const studio = new PromptStudio(makeBackend());
		studio.questionCount = 3;
		studio.multiAnswerCount = 0;
		studio.reviewQuestionCount = 8;
		expect(studio.warning).toBeNull();
	});

	/** A warning is not enough on its own; the prompt itself must stay coherent. */
	it('still emits a coherent prompt despite a contradictory request', () => {
		const studio = new PromptStudio(makeBackend());
		studio.topicsText = 'VPC routing';
		studio.questionCount = 5;
		studio.multiAnswerCount = 9;
		expect(studio.prompt).toContain('EXACTLY 5 questions in total');
		expect(studio.prompt).toContain('EXACTLY 5 of them multi-answer');
	});
});

describe('PromptStudio — the multi-answer count follows the question count', () => {
	/** A shorter mock should keep the real exam's proportions, not its absolute counts. */
	it('derives the count from the question count by default', () => {
		const studio = new PromptStudio(makeBackend());
		expect(studio.questionCount).toBe(65);
		expect(studio.multiAnswerCount).toBe(13);
		expect(studio.multiAnswerIsAutomatic).toBe(true);
	});

	it.each([
		[65, 13],
		[10, 2],
		[20, 4],
		[5, 1],
		[1, 0]
	])('gives %i questions %i multi-answer', (questions, expected) => {
		const studio = new PromptStudio(makeBackend());
		studio.questionCount = questions;
		expect(studio.multiAnswerCount).toBe(expected);
	});

	it('follows the question count as it changes', () => {
		const studio = new PromptStudio(makeBackend());
		studio.questionCount = 10;
		expect(studio.multiAnswerCount).toBe(2);
		studio.questionCount = 40;
		expect(studio.multiAnswerCount).toBe(8);
	});

	it('stops following once an explicit count is set', () => {
		const studio = new PromptStudio(makeBackend());
		studio.multiAnswerCount = 7;
		expect(studio.multiAnswerIsAutomatic).toBe(false);
		studio.questionCount = 10;
		expect(studio.multiAnswerCount).toBe(7);
	});

	it('can be handed back to the question count', () => {
		const studio = new PromptStudio(makeBackend());
		studio.multiAnswerCount = 7;
		studio.questionCount = 10;
		studio.resetMultiAnswerCount();
		expect(studio.multiAnswerIsAutomatic).toBe(true);
		expect(studio.multiAnswerCount).toBe(2);
	});

	it('remembers an explicit count but not a derived one', () => {
		const backend = makeBackend();
		const first = new PromptStudio(backend);
		first.multiAnswerCount = 9;
		first.persist();
		expect(new PromptStudio(backend).multiAnswerCount).toBe(9);

		const other = makeBackend();
		const auto = new PromptStudio(other);
		auto.questionCount = 20;
		auto.persist();
		const revived = new PromptStudio(other);
		revived.questionCount = 20;
		expect(revived.multiAnswerIsAutomatic).toBe(true);
		expect(revived.multiAnswerCount).toBe(4);
	});

	it('reaches the prompt', () => {
		const studio = new PromptStudio(makeBackend());
		studio.topicsText = 'VPC routing';
		studio.questionCount = 10;
		expect(studio.prompt).toContain('EXACTLY 2 of them multi-answer');
	});
});
