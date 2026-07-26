import { describe, expect, it } from 'vitest';

import { DEFAULT_EXAM_CONFIG } from '../domain/constants';
import type { Report } from '../domain/report';
import {
	buildPrompt,
	DEFAULT_PROMPT_OPTIONS,
	normalisePromptOptions,
	weakTopicsFrom
} from './builder';
import type { PromptOptions } from './sections';

function options(overrides: Partial<PromptOptions> = {}): PromptOptions {
	return {
		...DEFAULT_PROMPT_OPTIONS,
		topics: ['VPC routing', 'EBS volume types'],
		config: DEFAULT_EXAM_CONFIG,
		...overrides
	};
}

describe('buildPrompt — structure', () => {
	const prompt = buildPrompt(options());

	it.each([
		'# ROLE',
		'# WHO THIS IS FOR',
		'# SCOPE',
		'# COMPOSITION',
		'# DIFFICULTY',
		'# ITEM-WRITING RULES',
		'# DISTRACTOR TAXONOMY',
		'# BANNED',
		'# WORKED EXAMPLE',
		'# SELF-AUDIT',
		'# OUTPUT'
	])('includes the %s section', (heading) => {
		expect(prompt).toContain(heading);
	});

	it('orders the rules before the worked example that demonstrates them', () => {
		expect(prompt.indexOf('# ITEM-WRITING RULES')).toBeLessThan(prompt.indexOf('# WORKED EXAMPLE'));
	});

	it('ends with the output contract, so the schema is freshest in context', () => {
		expect(prompt.lastIndexOf('# OUTPUT')).toBeGreaterThan(prompt.indexOf('# SELF-AUDIT'));
	});
});

describe('buildPrompt — scope', () => {
	it('lists the topics it was given', () => {
		const prompt = buildPrompt(options({ topics: ['VPC routing', 'S3 lifecycle'] }));
		expect(prompt).toContain('- VPC routing');
		expect(prompt).toContain('- S3 lifecycle');
	});

	it('leaves an obvious placeholder when no topics were given', () => {
		expect(buildPrompt(options({ topics: [] }))).toContain('PASTE THE TOPICS');
	});

	it('carries weak topics forward with a review instruction', () => {
		const prompt = buildPrompt(
			options({ weakTopics: ['KMS key policies'], reviewQuestionCount: 3 })
		);
		expect(prompt).toContain('KMS key policies');
		expect(prompt).toContain('EXACTLY 3 review question');
		expect(prompt).toContain('do not reuse');
	});

	it('says nothing about review when there are no weak topics', () => {
		expect(buildPrompt(options({ weakTopics: [] }))).not.toContain('review question');
	});

	it('says nothing about review when none were asked for', () => {
		const prompt = buildPrompt(options({ weakTopics: ['X'], reviewQuestionCount: 0 }));
		expect(prompt).not.toContain('review question');
	});
});

describe('buildPrompt — composition', () => {
	it('states the exact counts', () => {
		const prompt = buildPrompt(options({ questionCount: 20, multiAnswerCount: 5 }));
		expect(prompt).toContain('EXACTLY 20 questions in total');
		expect(prompt).toContain('EXACTLY 5 of them multi-answer');
		expect(prompt).toContain('remaining 15 single-answer');
	});

	/** Both forms occur on the real exam, so the prompt must permit both. */
	it('permits Select TWO and Select THREE with the right option counts', () => {
		const prompt = buildPrompt(options());
		expect(prompt).toContain('(Select TWO.)');
		expect(prompt).toContain('(Select THREE.)');
		expect(prompt).toContain('exactly 5 options, exactly 2 correct');
		expect(prompt).toContain('exactly 6 options, exactly 3 correct');
	});

	it('defaults to Select TWO rather than encouraging Select THREE', () => {
		expect(buildPrompt(options())).toContain('Default to Select TWO');
	});

	/** The report derives the date from the attempt's start time, so asking for it wastes a slot. */
	it('does not ask the generator for a date', () => {
		expect(buildPrompt(options())).not.toContain('"date"');
	});

	it('carries the exam config into the schema', () => {
		const prompt = buildPrompt(options());
		expect(prompt).toContain(`"pass_percent": ${DEFAULT_EXAM_CONFIG.passPercent}`);
		expect(prompt).toContain(`"seconds_per_question": ${DEFAULT_EXAM_CONFIG.secondsPerQuestion}`);
		expect(prompt).toContain('Secure | Resilient | High-Performing | Cost-Optimized');
	});
});

describe('buildPrompt — quality instructions', () => {
	const prompt = buildPrompt(options());

	it('forbids the correct option being the longest', () => {
		expect(prompt).toContain('correct option must NOT be the longest');
	});

	it('gives a numeric length budget rather than a vague instruction', () => {
		expect(prompt).toMatch(/between \d+ and \d+ characters/);
		expect(prompt).toMatch(/no more than [\d.]+× the shortest/);
	});

	it.each([
		'true-but-doesn',
		'right-service-wrong-feature',
		'valid-but-inferior-here',
		'common-misconception'
	])('names the %s distractor type', (type) => {
		expect(prompt).toContain(type);
	});

	it.each(['All of the above', 'None of the above', 'Absolutes'])('bans %s', (pattern) => {
		expect(prompt).toContain(pattern);
	});

	it('demands a self-contained stem, since labels are hidden during the exam', () => {
		expect(prompt).toContain('Cover the topic label');
		expect(prompt).toContain('Self-contained');
	});

	it('shows a failing question alongside its repair', () => {
		expect(prompt).toContain('## Bad');
		expect(prompt).toContain('## Repaired');
		expect(prompt).toContain('Why it fails');
	});

	it('demands raw JSON with no fence or commentary', () => {
		expect(prompt).toContain('no markdown fence');
		expect(prompt).toContain('nothing else');
	});
});

describe('buildPrompt — difficulty', () => {
	it.each([
		['building', 'below the real exam'],
		['exam', 'Match real SAA-C03 difficulty exactly'],
		['brutal', 'above the real exam']
	] as const)('describes %s difficulty', (difficulty, expected) => {
		expect(buildPrompt(options({ difficulty }))).toContain(expected);
	});

	it('describes exactly one difficulty at a time', () => {
		const prompt = buildPrompt(options({ difficulty: 'brutal' }));
		expect(prompt).not.toContain('Match real SAA-C03 difficulty exactly');
	});
});

describe('normalisePromptOptions', () => {
	it('leaves a coherent set untouched', () => {
		const input = options({ questionCount: 10, multiAnswerCount: 2 });
		expect(normalisePromptOptions(input)).toMatchObject({
			questionCount: 10,
			multiAnswerCount: 2
		});
	});

	it('caps multi-answer questions at the total', () => {
		const result = normalisePromptOptions(options({ questionCount: 5, multiAnswerCount: 12 }));
		expect(result.multiAnswerCount).toBe(5);
	});

	it('caps review questions at the total', () => {
		const result = normalisePromptOptions(
			options({ questionCount: 4, reviewQuestionCount: 9, weakTopics: ['X'] })
		);
		expect(result.reviewQuestionCount).toBe(4);
	});

	it('drops review questions entirely when there are no weak topics', () => {
		const result = normalisePromptOptions(options({ reviewQuestionCount: 3, weakTopics: [] }));
		expect(result.reviewQuestionCount).toBe(0);
	});

	it('requires at least one question', () => {
		expect(normalisePromptOptions(options({ questionCount: 0 })).questionCount).toBe(1);
		expect(normalisePromptOptions(options({ questionCount: -5 })).questionCount).toBe(1);
	});

	it('rounds fractional counts', () => {
		expect(normalisePromptOptions(options({ questionCount: 10.6 })).questionCount).toBe(11);
	});

	it('caps an absurd request', () => {
		expect(normalisePromptOptions(options({ questionCount: 99999 })).questionCount).toBe(200);
	});
});

describe('weakTopicsFrom', () => {
	it('returns nothing without a report', () => {
		expect(weakTopicsFrom(null)).toEqual([]);
	});

	it('reads the weak topics from a report', () => {
		const report = { weak_topics: ['VPC routing', 'KMS'] } as unknown as Report;
		expect(weakTopicsFrom(report)).toEqual(['VPC routing', 'KMS']);
	});

	it('copies rather than aliasing the report', () => {
		const report = { weak_topics: ['A'] } as unknown as Report;
		const topics = weakTopicsFrom(report);
		topics.push('B');
		expect(report.weak_topics).toEqual(['A']);
	});
});
