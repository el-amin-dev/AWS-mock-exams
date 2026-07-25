import type { Question } from './types';

/**
 * Study aids for practice mode.
 *
 * Practice mode is for learning, so being stuck should be productive rather than a coin
 * flip. Asking for help gives back three things, in increasing order of specificity:
 *
 * 1. **Technique** — how to attack this shape of question. Transfers to the real exam.
 * 2. **Area** — which topic and domain it belongs to, hidden by default because a question
 *    that is only answerable once you know its topic is a broken question.
 * 3. **Hint** — a nudge the question's author wrote, pointing at the deciding concept
 *    without naming the answer. Only present if the generator supplied one.
 *
 * None of this exists in exam mode. The real exam offers no hints, and offering them there
 * would make the score meaningless.
 */

/** One piece of help, ordered from most general to most specific. */
export interface Tip {
	readonly label: string;
	readonly body: string;
}

/** Technique advice that always applies. */
const GENERAL_TECHNIQUE: Tip = {
	label: 'Technique',
	body:
		'Read the last sentence first — it tells you what is actually being asked. Then find the ' +
		'constraint in the scenario that decides it: cost, latency, durability, operational ' +
		'overhead, or compliance. Options that ignore that constraint are the distractors.'
};

/** Multi-answer questions fail in a specific, expensive way. */
const MULTI_ANSWER_TECHNIQUE: Tip = {
	label: 'This is all or nothing',
	body:
		'Selecting some but not all of the correct options scores zero — there is no partial ' +
		'credit. Treat each option as its own true-or-false question and commit only to the ones ' +
		'you can justify on their own.'
};

/** Eliminating is usually faster than selecting. */
const ELIMINATION_TECHNIQUE: Tip = {
	label: 'Eliminate first',
	body:
		'Strike out anything that is true but does not answer the question asked, and anything ' +
		'naming the right service but the wrong feature. Those two account for most wrong ' +
		'options, and removing them usually leaves a straight choice between two.'
};

/**
 * Builds the help available for a question.
 *
 * @param question The question on screen.
 * @param requiredSelections How many options it expects, which decides the technique shown.
 */
export function tipsFor(question: Question, requiredSelections: number): Tip[] {
	const tips: Tip[] = [GENERAL_TECHNIQUE];

	tips.push(requiredSelections > 1 ? MULTI_ANSWER_TECHNIQUE : ELIMINATION_TECHNIQUE);

	const area = [question.topic, question.domain].filter(Boolean).join(' · ');
	if (area) {
		tips.push({
			label: 'What this is testing',
			body: area
		});
	}

	if (question.hint && question.hint.trim()) {
		tips.push({ label: 'Hint', body: question.hint.trim() });
	}

	return tips;
}
