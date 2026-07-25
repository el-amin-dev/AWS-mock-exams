import type { ExamConfig } from '../domain/types';
import { formatTopics } from './topics';

/**
 * The prompt, section by section.
 *
 * Each section is a separate function so it can be read, changed and tested on its own. The
 * previous engine built its prompt as one long template literal, which made it impossible to
 * say which instruction was carrying its weight.
 *
 * The whole thing targets one failure: a loosely prompted generator writes questions that can
 * be answered without knowing the subject. It pads the right answer, makes distractors
 * obviously silly, or leaks the answer through grammar. Every rule below exists to close one
 * of those routes, because a mock you can pass by pattern-matching teaches nothing and
 * inflates your confidence before the real exam.
 */

/** How hard the generated questions should be. */
export type Difficulty = 'building' | 'exam' | 'brutal';

/** Everything the prompt needs to know. */
export interface PromptOptions {
	/** Topics the mock must be scoped to. */
	readonly topics: readonly string[];
	readonly questionCount: number;
	/** How many of those are multi-answer. */
	readonly multiAnswerCount: number;
	readonly difficulty: Difficulty;
	readonly config: ExamConfig;
	/** Topics scored below the pass mark last time, carried forward for review. */
	readonly weakTopics: readonly string[];
	/** How many review questions to mix in, drawn from the weak topics. */
	readonly reviewQuestionCount: number;
}

/** Target length range for an option, in characters. */
const OPTION_MIN_CHARS = 40;
const OPTION_MAX_CHARS = 160;
/** Largest permitted gap between the shortest and longest option in one question. */
const OPTION_SPREAD_RATIO = 1.6;

export function roleSection(): string {
	return `# ROLE

You are an experienced certification item writer producing practice questions for the AWS
Certified Solutions Architect – Associate (SAA-C03) exam. You write items that discriminate
between candidates who understand the material and candidates who do not. You are not
writing a quiz, a tutorial, or a summary.`;
}

export function candidateSection(): string {
	return `# WHO THIS IS FOR

- Preparing for SAA-C03 and sitting timed mocks to find weak spots.
- Wants questions at real exam difficulty, not easier.
- Reads the explanations afterwards, so every option's explanation must teach something,
  including the wrong ones.
- Sits these blind: topic and domain labels are hidden during the exam, so a question that
  is only answerable once you know its topic is a broken question.`;
}

/** The topics the mock is scoped to, plus any weak topics carried forward. */
export function scopeSection(options: PromptOptions): string {
	const topics =
		options.topics.length > 0
			? formatTopics(options.topics)
			: '<<< PASTE THE TOPICS THIS MOCK MUST COVER >>>';

	const review =
		options.weakTopics.length > 0 && options.reviewQuestionCount > 0
			? `

## Carry forward — I scored below the pass mark on these last time

${formatTopics(options.weakTopics)}

Mix in EXACTLY ${options.reviewQuestionCount} review question(s) drawn from this list, spread
randomly through the mock rather than grouped. Test the underlying concept from a different
angle — do not reuse or lightly reword a question I have already seen. These count toward the
total below, they are not extra.`
			: '';

	return `# SCOPE

Cover only these topics. Do not test any service or feature outside them, however tempting
the overlap — a question I cannot yet answer teaches me nothing about what I just studied.

${topics}${review}`;
}

/** Question counts and exam shape. */
export function compositionSection(options: PromptOptions): string {
	const single = Math.max(0, options.questionCount - options.multiAnswerCount);
	const twoAnswerOptions = options.config.multiAnswerOptionCount;
	return `# COMPOSITION

- EXACTLY ${options.questionCount} questions in total.
- EXACTLY ${options.multiAnswerCount} of them multi-answer; the remaining ${single} single-answer.
- Single-answer: exactly ${options.config.singleAnswerOptionCount} options, exactly 1 correct.
- Multi-answer: end the stem with "(Select TWO.)" or "(Select THREE.)".
  - Select TWO — exactly ${twoAnswerOptions} options, exactly 2 correct.
  - Select THREE — exactly ${twoAnswerOptions + 1} options, exactly 3 correct.
  - Default to Select TWO. Use Select THREE only where the topic genuinely has three
    distinct correct steps or properties, rather than to pad a question out.
- Every option carries a "why", including the correct ones.
- If the topics genuinely cannot support these counts, get as close as possible and say so
  in one line before the JSON.`;
}

export function difficultySection(difficulty: Difficulty): string {
	const body: Record<Difficulty, string> = {
		building: `Pitch slightly below the real exam. These are foundational topics and I am still
building the mental model. Stay scenario-based, but favour clarity over subtlety. Distractors
should be genuinely wrong rather than merely worse.`,
		exam: `Match real SAA-C03 difficulty exactly. Scenario-based, "choose the BEST answer",
with distractors that a candidate who half-understands the topic would seriously consider.`,
		brutal: `Pitch above the real exam. Maximally subtle distinctions, several defensible
answers with one clearly best, and scenarios where the obvious reading is the wrong one. If I
can pass this comfortably, the real exam should feel easy.`
	};
	return `# DIFFICULTY

${body[difficulty]}`;
}

/** The rules that actually decide whether a question discriminates. */
export function itemWritingSection(): string {
	return `# ITEM-WRITING RULES

## The stem
- Self-contained: it must include every fact needed to answer it. I cannot see the topic or
  domain label while sitting the exam.
- Concrete scenario, not a definition lookup. "A company needs X under constraint Y" beats
  "Which service provides X?".
- State the deciding constraint explicitly — cost, latency, durability, operational overhead,
  compliance. If nothing in the stem forces one answer over another, the question is broken.
- No negatives unless unavoidable; if you must, bold the NOT or EXCEPT.

## The options
- Length: each option between ${OPTION_MIN_CHARS} and ${OPTION_MAX_CHARS} characters, and
  within one question the longest must be no more than ${OPTION_SPREAD_RATIO}× the shortest.
- The correct option must NOT be the longest. Vary which position is longest across the mock,
  and make a WRONG option the longest more often than not. Length must never hint at anything.
- Same register, tense and grammatical shape throughout, so nothing is eliminable on form.
- Same level of specificity: do not pair a precisely qualified correct answer with vague
  distractors.
- Parallel openings — if one starts with a verb, they all do.
- Order them so the correct answer lands in a different position each time.

## The hint
- Give every question a one-sentence "hint" that points at the concept which decides it
  WITHOUT naming or describing the correct option. "Note which of these is stateless" is a
  hint; "io2 is the fastest" is the answer. It is shown only on request in practice mode.

## The explanations
- Correct options start "Correct — ", wrong options start "Wrong — ".
- Say WHY, not THAT. "Wrong — gp3 tops out at 16,000 IOPS per volume" teaches; "Wrong — this
  is not the best option" does not.
- Name the distractor type (see below) inside each wrong option's explanation.`;
}

/** Forces every wrong option to be wrong for a stated, useful reason. */
export function distractorTaxonomySection(): string {
	return `# DISTRACTOR TAXONOMY

Every wrong option must be one of these four, and its "why" must name which:

1. **true-but-doesn't-answer-it** — a factually correct statement that does not address the
   question actually asked. Catches candidates who pattern-match on keywords.
2. **right-service-wrong-feature** — the correct service, but a feature that does not do this.
   Catches shallow familiarity.
3. **valid-but-inferior-here** — would genuinely work, but loses on the constraint the stem
   specifies. This is the one that makes "choose the BEST answer" mean something.
4. **common-misconception** — something widely believed and wrong.

Across each question use at least two different types. A question whose distractors are all
the same type is too easy.`;
}

export function bannedPatternsSection(): string {
	return `# BANNED — these make a question answerable without knowing the subject

- "All of the above", "None of the above", "Both A and B".
- Absolutes ("always", "never", "all", "only") used as a tell — if one option contains one,
  at least one other must too.
- Absurd or joke options. Every distractor must be plausible to someone who half-understands.
- Options eliminable by grammar, tense or article agreement with the stem.
- The correct option being the most detailed, most hedged, or most technically worded.
- Repeating a distinctive phrase from the stem in the correct option only.
- Two options that are logically identical in different words.
- Any question answerable purely by knowing which topic it belongs to.`;
}

/** One concrete failure and its repair, which lands harder than any abstract rule. */
export function workedExampleSection(): string {
	return `# WORKED EXAMPLE — a bad question and its repair

## Bad
Stem: "Which EBS volume type is best for high-performance databases?"
Options:
  A. io2 Block Express, which delivers sustained sub-millisecond latency and up to 256,000
     provisioned IOPS per volume for the most demanding transactional workloads  [correct]
  B. sc1
  C. Magnetic (standard)
  D. All of the above

Why it fails: the correct option is four times the length of any other and is the only one
that reads like an answer. There is no scenario, so nothing forces a choice — "high-performance"
is not a constraint. C is not seriously offered. D is banned.

## Repaired
Stem: "A transactional database on a single 400 GiB volume must sustain 40,000 IOPS with
consistent sub-millisecond latency. Cost is secondary to performance. Which volume type meets
this?"
Options:
  A. gp3, scaled to its maximum provisioned IOPS
  B. io2 Block Express with provisioned IOPS  [correct]
  C. st1, sized for the required throughput
  D. Two gp3 volumes in a striped RAID 0 set

Why it works: the stem gives a number that decides it. A is right-service-wrong-feature — gp3
caps at 16,000 IOPS. C is a common-misconception, confusing throughput with IOPS. D is
valid-but-inferior-here — it reaches the IOPS but adds failure modes the stem does not accept.
Every option is a real thing someone might choose, and the correct one is not the longest.`;
}

/** Makes the generator check its own work before emitting. */
export function selfAuditSection(options: PromptOptions): string {
	return `# SELF-AUDIT — run this before you emit anything

Check every question against this list and fix what fails. Do not report the audit; just
apply it.

1. Cover the topic label. Is the question still answerable from the stem alone?
2. Measure the options. Is the correct one the longest? If so, rewrite.
3. Is the longest option a wrong one in at least half the questions?
4. Does every wrong option name its distractor type in its "why"?
5. Does at least one option per question earn "valid-but-inferior-here" or
   "true-but-doesn't-answer-it"?
6. Could any option be eliminated on grammar alone?
7. Is the correct answer in a different position from the previous question?
8. Are the counts exactly ${options.questionCount} total and ${options.multiAnswerCount}
   multi-answer?
9. Is every option's "why" specific enough to teach me something on its own?
9a. Does the hint point at the deciding concept without giving the answer away?
10. Is anything outside the listed topics being tested?`;
}

/** The exact JSON shape the engine consumes. */
export function outputContractSection(options: PromptOptions): string {
	const schema = `{
  "exam_id": "saa-c03-mock",
  "date": "<YYYY-MM-DD>",
  "title": "SAA-C03 Mock",
  "subtitle": "<short description of what this mock covers>",
  "topics_covered": ["<topic>", "..."],
  "config": {
    "seconds_per_question": ${options.config.secondsPerQuestion},
    "pass_percent": ${options.config.passPercent},
    "randomize_questions": true,
    "randomize_options": true
  },
  "questions": [
    {
      "topic": "<short label, matching one of the topics above>",
      "domain": "<one of: ${options.config.domains.map((domain) => domain.name).join(' | ')}>",
      "stem": "<self-contained scenario; multi-answer ends with '(Select TWO.)'>",
      "hint": "<one sentence pointing at the deciding concept, never naming the answer>",
      "options": [
        { "text": "<option>", "correct": true, "why": "Correct — <why this is right>" },
        { "text": "<option>", "correct": false, "why": "Wrong — <type>: <why this is wrong>" }
      ]
    }
  ]
}`;

	return `# OUTPUT

Return the JSON file and nothing else. No preamble, no commentary, no markdown fence around
it, no explanation of what you did. The engine parses your output directly.

${schema}`;
}
