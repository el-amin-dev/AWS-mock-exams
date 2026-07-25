/**
 * Turning pasted text into a topic list.
 *
 * The engine deliberately knows nothing about any syllabus. The candidate pastes whatever
 * form their topics happen to be in — a numbered list, bullets, one per line, copied
 * straight from a lesson index — and this normalises it. Being permissive here is the whole
 * point: anything that demands a particular format would push the work back onto the person
 * using it.
 */

/** Leading list markers to strip: bullets, dashes, and numbering such as `3.` or `2)`. */
const LEADING_MARKER = /^\s*(?:[-*•·–—]+|\d+\s*[.)\]:]|\(\d+\))\s*/;

/** Trailing noise left behind by copied lesson indexes, such as durations. */
const TRAILING_NOISE = /\s*[-–—]?\s*\(?\d{1,2}:\d{2}\)?\s*$/;

/** Longest a single topic may be before it is treated as prose rather than a label. */
const MAX_TOPIC_LENGTH = 200;

/**
 * Parses pasted text into distinct topics.
 *
 * Splits on newlines, strips list markers and trailing timestamps, drops blanks, and removes
 * duplicates while preserving the order given — that order is meaningful, since it usually
 * reflects the order the material was taught.
 */
export function parseTopics(input: string): string[] {
	const seen = new Set<string>();
	const topics: string[] = [];

	for (const line of input.split(/\r?\n/)) {
		const cleaned = line.replace(LEADING_MARKER, '').replace(TRAILING_NOISE, '').trim();
		if (!cleaned) continue;
		if (cleaned.length > MAX_TOPIC_LENGTH) {
			topics.push(cleaned.slice(0, MAX_TOPIC_LENGTH).trimEnd());
			continue;
		}
		const key = cleaned.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		topics.push(cleaned);
	}

	return topics;
}

/** Renders topics back as a plain list, for embedding in a prompt. */
export function formatTopics(topics: readonly string[]): string {
	return topics.map((topic) => `- ${topic}`).join('\n');
}
