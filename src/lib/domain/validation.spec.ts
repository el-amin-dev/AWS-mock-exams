import { describe, expect, it } from 'vitest';

import { makeMock, makeOption, makeQuestion } from '../../../tests/factories';
import { DEFAULT_EXAM_CONFIG } from './constants';
import { validateMock } from './validation';

const config = DEFAULT_EXAM_CONFIG;

/** Joins every message so a spec can assert on wording without indexing into the array. */
function messages(issues: readonly { message: string }[]): string {
	return issues.map((issue) => issue.message).join(' | ');
}

describe('validateMock — structural errors', () => {
	it('accepts a well-formed mock', () => {
		const result = validateMock(makeMock([{ correct: [0] }, { correct: [1] }]), config);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.questionCount).toBe(2);
		expect(result.mock).not.toBeNull();
	});

	it.each([
		['null', null],
		['a string', 'not a mock'],
		['an array', []],
		['a number', 42]
	])('rejects %s at the top level', (_label, input) => {
		const result = validateMock(input, config);
		expect(result.valid).toBe(false);
		expect(messages(result.errors)).toContain('not a JSON object');
	});

	it('rejects a mock with no questions array', () => {
		expect(validateMock({ title: 'x' }, config).valid).toBe(false);
	});

	it('rejects an empty questions array', () => {
		expect(validateMock({ questions: [] }, config).valid).toBe(false);
	});

	it('rejects a question that is not an object', () => {
		const result = validateMock({ questions: ['nope'] }, config);
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.path).toBe('Q1');
	});

	it('rejects an empty stem', () => {
		const result = validateMock({ questions: [{ ...makeQuestion(), stem: '   ' }] }, config);
		expect(messages(result.errors)).toContain('stem');
	});

	it('rejects a question with too few options', () => {
		const result = validateMock(
			{ questions: [{ ...makeQuestion(), options: [makeOption()] }] },
			config
		);
		expect(messages(result.errors)).toContain('options');
	});

	it('rejects an option that is not an object', () => {
		const question = makeQuestion();
		const result = validateMock({ questions: [{ ...question, options: ['A', 'B'] }] }, config);
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.path).toBe('Q1 option A');
		expect(messages(result.errors)).toContain('Not an object');
	});

	it('rejects an option with no explanation', () => {
		const question = makeQuestion();
		const options = [{ ...question.options[0], why: '' }, ...question.options.slice(1)];
		const result = validateMock({ questions: [{ ...question, options }] }, config);
		expect(messages(result.errors)).toContain('why');
	});

	it('rejects a non-boolean "correct" rather than coercing it', () => {
		const question = makeQuestion();
		const options = [{ ...question.options[0], correct: 'yes' }, ...question.options.slice(1)];
		const result = validateMock({ questions: [{ ...question, options }] }, config);
		expect(messages(result.errors)).toContain('true or false');
	});

	it('rejects a question with no correct option', () => {
		const result = validateMock({ questions: [makeQuestion({ correct: [] })] }, config);
		expect(messages(result.errors)).toContain('No option is marked correct');
	});

	it('withholds the mock whenever any error was raised', () => {
		expect(validateMock({ questions: [{}] }, config).mock).toBeNull();
	});

	it('reports every problem at once rather than stopping at the first', () => {
		const result = validateMock({ questions: [{}, {}, {}] }, config);
		expect(new Set(result.errors.map((error) => error.path)).size).toBe(3);
	});
});

describe('validateMock — quality warnings', () => {
	it('warns, but does not block, when a single-answer question has five options', () => {
		const result = validateMock(makeMock([{ correct: [0], optionCount: 5 }]), config);
		expect(result.valid).toBe(true);
		expect(messages(result.warnings)).toContain('5 options; 4 expected');
	});

	it('warns, but does not block, when a multi-answer question has four options', () => {
		const result = validateMock(makeMock([{ correct: [0, 1], optionCount: 4 }]), config);
		expect(result.valid).toBe(true);
		expect(messages(result.warnings)).toContain('5 expected');
	});

	/** "Select THREE" is legitimate on the real exam and must not be rejected. */
	it('supports three correct options', () => {
		const result = validateMock(makeMock([{ correct: [0, 1, 2], optionCount: 5 }]), config);
		expect(result.valid).toBe(true);
		expect(messages(result.warnings)).not.toContain('verify this is intended');
	});

	it('warns when the correct-option count looks like a mistake', () => {
		const result = validateMock(makeMock([{ correct: [0, 1, 2, 3], optionCount: 5 }]), config);
		expect(messages(result.warnings)).toContain('verify this is intended');
	});

	it('warns when the correct option is the longest', () => {
		const result = validateMock(
			makeMock([
				{
					correct: [0],
					optionText: {
						0: 'A markedly longer and more carefully qualified answer than the others',
						1: 'Short',
						2: 'Also short',
						3: 'Brief too'
					}
				}
			]),
			config
		);
		expect(messages(result.warnings)).toContain('longest');
	});

	it('stays quiet when a wrong option is the longest', () => {
		const result = validateMock(
			makeMock([
				{
					correct: [0],
					optionText: {
						0: 'Short',
						1: 'A markedly longer and more carefully qualified distractor than the rest',
						2: 'Also short',
						3: 'Brief too'
					}
				}
			]),
			config
		);
		expect(messages(result.warnings)).not.toContain('longest');
	});

	it('warns about a missing topic and defaults it, rather than failing', () => {
		const question = makeQuestion();
		const result = validateMock({ questions: [{ ...question, topic: '' }] }, config);
		expect(result.valid).toBe(true);
		expect(messages(result.warnings)).toContain('weak-topic detection');
		expect(result.mock?.questions[0]?.topic).toBe('General');
	});

	it('warns when the config block is absent', () => {
		const result = validateMock({ questions: [makeQuestion()] }, config);
		expect(messages(result.warnings)).toContain('engine defaults');
	});

	it('honours a different expected option count from the exam config', () => {
		const relaxed = { ...config, singleAnswerOptionCount: 5 };
		const result = validateMock(makeMock([{ correct: [0], optionCount: 5 }]), relaxed);
		expect(messages(result.warnings)).not.toContain('expected');
	});
});

describe('validateMock — normalisation', () => {
	it('preserves a declared domain', () => {
		const result = validateMock(makeMock([{ correct: [0], domain: 'Secure' }]), config);
		expect(result.mock?.questions[0]?.domain).toBe('Secure');
	});

	it('omits the domain entirely when none was supplied', () => {
		const result = validateMock(makeMock([{ correct: [0] }]), config);
		expect(result.mock?.questions[0]?.domain).toBeUndefined();
	});

	it('keeps top-level metadata intact', () => {
		const result = validateMock(makeMock([{ correct: [0] }], { subtitle: 'Day 4' }), config);
		expect(result.mock?.subtitle).toBe('Day 4');
		expect(result.mock?.exam_id).toBe('test-mock');
	});
});
