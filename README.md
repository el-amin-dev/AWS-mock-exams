# Mock Exam Engine

A browser-based mock-exam engine for the **AWS Certified Solutions Architect – Associate
(SAA-C03)** exam. It builds a high-precision prompt from the topics you paste, sits the mock
your assistant generates, grades it the way the real exam does, and feeds your weak spots back
into the next prompt.

> ⚠️ **Unofficial personal study project.** Not affiliated with, endorsed by, or sponsored by
> Amazon Web Services or any course provider. It ships with **no exam content** — the bundled
> practice mocks were written from scratch for self-study, and every other question you sit is
> one you generated yourself. These are not real exam questions or "dumps".

## The loop

1. **Build a prompt** — paste the topics you studied, set the shape, copy the prompt.
2. **Generate a mock** — paste it into whichever assistant you use, save the reply as `.json`.
3. **Sit it** — in Exam mode or Practice mode.
4. **Read the result** — your weak topics are carried into the next prompt automatically.

## Two modes

|              | **Exam**                           | **Practice**                                                                         |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Feedback     | Nothing until you submit           | Immediate, per question                                                              |
| Timer        | Counts **down**, auto-submits at 0 | Counts **up** from 00:00, never cut short                                            |
| Topic labels | Hidden                             | Revealed on request                                                                  |
| Help         | None                               | An **(i)** button offering technique, the area being tested, and the question's hint |
| For          | Testing yourself                   | Learning                                                                             |

Exam mode reproduces the real testing interface — proportions, palette, typography, controls,
flag-for-review, strike-through elimination and the review grid — because the point is that
sitting a mock should feel like sitting the real thing.

## Scoring, the way the real exam does it

The real exam is **65 questions in 130 minutes**, of which **15 are unscored**, and it never
says which. The same answers can therefore produce different reported scores. The engine
applies that proportionally, `round(n × 15/65)`, and reports the range:

```
        78%                              ← your true score, across every question
   with unscored applied: 70% – 90%      ← what the exam could have reported
   verdict on: a random draw  [change ▾]
```

- **worst** — the unscored questions land on ones you got _right_
- **best** — they land on ones you got _wrong_
- **random** — a seeded draw, as the real exam effectively does

You choose which figure decides pass or fail; the true score is always shown. The seed lives
on the attempt, so reloading cannot buy you a better draw.

Also matched to the real exam: a **720 / 1000** scaled pass mark, the four domain weightings
(Secure 30%, Resilient 26%, High-Performing 24%, Cost-Optimized 20%), no partial credit on
multi-answer questions, and support for both "Select TWO" and "Select THREE".

Defaults to a full-length 65-question mock, which at 120 seconds per question is exactly the
real 130-minute budget. Ask for fewer and the clock shortens with it.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173
```

`static/sample-mock.json` is a five-question example — the quickest smoke test, and enough to
see the whole flow before generating anything.

Three fuller mocks ship with the repo as well, each 20 questions (16 single-answer and 4
multi-answer), so there is something worth sitting before you have generated any of your own,
and a yardstick to judge the ones you generate against:

| File                                  | Difficulty                           | Focus                                                                         |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `static/mocks/foundations.json`       | Building — slightly below exam level | IAM, S3, EC2 and VPC fundamentals                                             |
| `static/mocks/core-architecture.json` | Exam level                           | VPC, RDS, load balancing and Auto Scaling, S3 advanced, CloudFront, Route 53  |
| `static/mocks/advanced.json`          | Brutal — above exam level            | Serverless, DynamoDB, hybrid networking, security services, cost optimisation |

Load one from the **② Load a mock & sit it** tab by selecting the file. With the dev or preview
server running they are also served over HTTP at `/mocks/<name>.json` — for example
`/mocks/advanced.json` — so you can open or fetch one without going through the file picker.

They are original practice items written for self-study; sitting them tells you where your
understanding is thin, not what the real exam asks.

> The app uses ES modules and **cannot be opened directly from the filesystem**. Use the dev
> server, `npm run preview`, or the deployed site. See `docs/RUNBOOK.md` for every command.

## Nothing leaves your browser

There is no server, no account, and no telemetry. Your attempts, preferences and topics live
in `localStorage` and nowhere else. An in-flight exam is saved after every action, so a
refresh offers to resume it with the correct time remaining rather than losing it.

## Writing your own mock

The engine takes any JSON matching this shape. It validates before you start, separating
problems that block from quality warnings that do not — the most useful of which flags a
question whose correct option is the longest, since that is answerable without knowing the
subject.

```json
{
	"title": "SAA-C03 Mock",
	"subtitle": "Day 4 — VPC, EC2 storage, IAM",
	"topics_covered": ["VPC routing", "EBS volume types"],
	"config": { "seconds_per_question": 120, "pass_percent": 72 },
	"questions": [
		{
			"topic": "EBS volume types",
			"domain": "High-Performing",
			"stem": "A scenario containing every fact needed to answer it.",
			"hint": "One sentence pointing at the deciding concept, never the answer.",
			"options": [
				{ "text": "...", "correct": true, "why": "Correct — ..." },
				{ "text": "...", "correct": false, "why": "Wrong — <type>: ..." }
			]
		}
	]
}
```

Single-answer questions take 4 options with 1 correct; "Select TWO" takes 5 with 2; "Select
THREE" takes 6 with 3. Every option needs a `why`, including the correct one — they are what
you read afterwards.

## Project layout

```
src/lib/domain/    pure grading, validation, timing — no DOM, no framework
src/lib/prompt/    the generation prompt, one testable section at a time
src/lib/session/   attempt transitions and local storage
src/lib/state/     the live session and prompt studio
src/lib/ui/        components
```

The domain layer depends on nothing and is held to enforced coverage thresholds, because it is
where a bug would quietly cost you a real exam.

## Documentation

- `docs/RUNBOOK.md` — every command, verified to work as typed
- `docs/DECISIONS.md` — why the engine is built this way

## License

[MIT](LICENSE) — reuse and adapt it freely.
