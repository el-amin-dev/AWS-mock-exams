import { describe, expect, it } from 'vitest';

import { formatTopics, parseTopics } from './topics';

describe('parseTopics', () => {
	it('splits on newlines', () => {
		expect(parseTopics('VPC routing\nEBS volumes\nIAM roles')).toEqual([
			'VPC routing',
			'EBS volumes',
			'IAM roles'
		]);
	});

	it.each([
		['dashes', '- VPC routing\n- EBS volumes'],
		['asterisks', '* VPC routing\n* EBS volumes'],
		['bullets', '• VPC routing\n• EBS volumes'],
		['numbers with a dot', '1. VPC routing\n2. EBS volumes'],
		['numbers with a bracket', '1) VPC routing\n2) EBS volumes'],
		['parenthesised numbers', '(1) VPC routing\n(2) EBS volumes']
	])('strips %s', (_label, input) => {
		expect(parseTopics(input)).toEqual(['VPC routing', 'EBS volumes']);
	});

	/** Lesson indexes are usually copied with their runtimes attached. */
	it.each([
		['a bare timestamp', 'VPC routing 12:45'],
		['a bracketed timestamp', 'VPC routing (12:45)'],
		['a dashed timestamp', 'VPC routing — 12:45']
	])('strips %s', (_label, input) => {
		expect(parseTopics(input)).toEqual(['VPC routing']);
	});

	it('drops blank lines and stray whitespace', () => {
		expect(parseTopics('\n\n  VPC routing  \n\n\n   \nEBS volumes\n')).toEqual([
			'VPC routing',
			'EBS volumes'
		]);
	});

	it('removes duplicates regardless of case, keeping the first spelling', () => {
		expect(parseTopics('VPC routing\nvpc ROUTING\nEBS volumes')).toEqual([
			'VPC routing',
			'EBS volumes'
		]);
	});

	it('preserves the order given, since it reflects teaching order', () => {
		expect(parseTopics('Zebra\nApple\nMango')).toEqual(['Zebra', 'Apple', 'Mango']);
	});

	it('returns nothing for empty or whitespace-only input', () => {
		expect(parseTopics('')).toEqual([]);
		expect(parseTopics('   \n\n  ')).toEqual([]);
	});

	it('handles Windows line endings', () => {
		expect(parseTopics('VPC routing\r\nEBS volumes')).toEqual(['VPC routing', 'EBS volumes']);
	});

	it('truncates a line long enough to be prose rather than a label', () => {
		const long = 'x'.repeat(500);
		const [topic] = parseTopics(long);
		expect(topic?.length).toBeLessThanOrEqual(200);
	});

	it('keeps internal punctuation that is part of the topic', () => {
		expect(parseTopics('- S3: versioning, lifecycle & replication')).toEqual([
			'S3: versioning, lifecycle & replication'
		]);
	});

	it('handles a realistic paste', () => {
		const pasted = `
1. IAM Identity Policies  12:45
2. IAM Users and ARNs (08:30)
3. IAM Groups
   - Service Control Policies (SCPs)
3. IAM Groups
`;
		expect(parseTopics(pasted)).toEqual([
			'IAM Identity Policies',
			'IAM Users and ARNs',
			'IAM Groups',
			'Service Control Policies (SCPs)'
		]);
	});
});

describe('formatTopics', () => {
	it('renders a bulleted list', () => {
		expect(formatTopics(['A', 'B'])).toBe('- A\n- B');
	});

	it('renders nothing for an empty list', () => {
		expect(formatTopics([])).toBe('');
	});
});
