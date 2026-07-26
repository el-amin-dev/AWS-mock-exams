import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_EXAM_CONFIG } from '../src/lib/domain/constants';
import { validateMock } from '../src/lib/domain/validation';

/**
 * Guards every mock the repository ships.
 *
 * The mocks are the product as much as the engine is: a candidate who sits one and is
 * quietly rewarded for spotting the longest option learns nothing. Each file is therefore
 * put through the engine's own validator and required to come back with no errors *and* no
 * warnings — a stricter bar than the engine imposes on an arbitrary uploaded file.
 *
 * The list is discovered from the directory rather than written down, so a mock added later
 * is covered the moment it lands.
 */

const mocksDirectory = fileURLToPath(new URL('../mocks/', import.meta.url));

/**
 * Wrapped as single-element tuples so `it.each` types each case as one named argument
 * rather than a variadic spread.
 */
const mockFiles: [name: string][] = readdirSync(mocksDirectory)
	.filter((name) => name.endsWith('.json'))
	.sort()
	.map((name) => [name]);

/** Tool names that must never leak into shipped content. */
const TOOL_NAMES = [
	'claude',
	'anthropic',
	'openai',
	'chatgpt',
	'gpt-4',
	'gpt-5',
	'copilot',
	'gemini',
	'llama',
	'mistral',
	'perplexity'
];

interface RawOption {
	readonly text: string;
	readonly correct: boolean;
	readonly why: string;
}

interface RawQuestion {
	readonly stem: string;
	readonly hint?: string;
	readonly domain?: string;
	readonly options: readonly RawOption[];
}

interface RawMock {
	readonly questions: readonly RawQuestion[];
}

function readRaw(name: string): string {
	return readFileSync(`${mocksDirectory}${name}`, 'utf8');
}

function readMock(name: string): RawMock {
	return JSON.parse(readRaw(name)) as RawMock;
}

/** Joins issue messages so a failure names the offending question rather than a count. */
function describeIssues(issues: readonly { path: string; message: string }[]): string {
	return issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
}

function correctCount(question: RawQuestion): number {
	return question.options.filter((option) => option.correct).length;
}

describe('shipped mocks', () => {
	it('finds mocks to check', () => {
		expect(mockFiles.length).toBeGreaterThan(0);
	});

	it.each(mockFiles)('%s parses as JSON', (name) => {
		expect(() => JSON.parse(readRaw(name))).not.toThrow();
	});

	it.each(mockFiles)('%s validates with no errors', (name) => {
		const result = validateMock(readMock(name), DEFAULT_EXAM_CONFIG);
		expect(describeIssues(result.errors)).toBe('');
		expect(result.valid).toBe(true);
	});

	it.each(mockFiles)('%s validates with no quality warnings', (name) => {
		const result = validateMock(readMock(name), DEFAULT_EXAM_CONFIG);
		expect(describeIssues(result.warnings)).toBe('');
	});

	it.each(mockFiles)('%s gives every question a hint', (name) => {
		const missing = readMock(name)
			.questions.map((question, index) => ({ index, hint: question.hint }))
			.filter((entry) => (entry.hint ?? '').trim().length === 0)
			.map((entry) => `Q${entry.index + 1}`);
		expect(missing).toEqual([]);
	});

	/** The verdict prefix is what lets a candidate skim a review screen and still learn. */
	it.each(mockFiles)('%s explains every option with a verdict prefix', (name) => {
		const wrong: string[] = [];
		readMock(name).questions.forEach((question, questionIndex) => {
			question.options.forEach((option, optionIndex) => {
				const path = `Q${questionIndex + 1} option ${optionIndex + 1}`;
				const why = option.why ?? '';
				if (why.trim().length === 0) {
					wrong.push(`${path}: empty "why"`);
					return;
				}
				const expected = option.correct ? 'Correct — ' : 'Wrong — ';
				if (!why.startsWith(expected)) {
					wrong.push(`${path}: "why" should start "${expected}" but starts "${why.slice(0, 12)}"`);
				}
			});
		});
		expect(wrong).toEqual([]);
	});

	it.each(mockFiles)('%s repeats no question stem', (name) => {
		const stems = readMock(name).questions.map((question) => question.stem.trim().toLowerCase());
		const duplicates = stems.filter((stem, index) => stems.indexOf(stem) !== index);
		expect(duplicates).toEqual([]);
	});

	it.each(mockFiles)('%s names no authoring tool', (name) => {
		const text = readRaw(name).toLowerCase();
		const found = TOOL_NAMES.filter((tool) => text.includes(tool));
		expect(found).toEqual([]);
	});
});

/**
 * The model exam is the headline artefact, so its shape is asserted exactly: anything less
 * than a full-length paper under the published domain weighting is not a rehearsal.
 */
describe('mocks/building.json — the full-length model exam', () => {
	const modelExam = readMock('building.json');

	it('runs to full length', () => {
		expect(modelExam.questions).toHaveLength(65);
	});

	it('carries the expected number of multi-answer questions', () => {
		const multi = modelExam.questions.filter((question) => correctCount(question) > 1);
		expect(multi).toHaveLength(13);
	});

	it('splits across the domains by the official weighting', () => {
		const counts = new Map<string, number>();
		for (const question of modelExam.questions) {
			const domain = question.domain ?? 'none';
			counts.set(domain, (counts.get(domain) ?? 0) + 1);
		}
		expect(Object.fromEntries(counts)).toEqual({
			Secure: 20,
			Resilient: 17,
			'High-Performing': 15,
			'Cost-Optimized': 13
		});
	});
});
