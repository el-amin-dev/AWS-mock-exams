# Architecture Decision Records

> Append-only. One entry per significant decision. Newest on top.
> "Significant" = affects architecture, data model, security posture, or is hard to reverse.

<!--
Entry format (use exactly this shape):

## ADR-NNN — <title> (<date>)
- status: accepted | superseded-by-ADR-NNN
- context: <what forced a decision>
- decision: <what was chosen>
- alternatives: <what was rejected + why>
- consequences: <trade-offs accepted>
-->

## ADR-004 — Validation splits hard errors from quality warnings (2026-07-25)

- status: accepted
- context: The previous engine treated question _shape_ as correctness: a single-answer
  question with five options, or any question with three correct options, was rejected
  outright and could not be sat. Both are legitimate — "Select THREE" appears on the real
  exam — so the rule blocked valid content while doing nothing about content that was
  genuinely bad.
- decision: Two independent severities. **Errors** mean the engine cannot present the mock
  (missing stem, malformed option, no correct answer) and block starting. **Warnings** mean
  the mock is usable but the item writing is suspect (unexpected option count, correct
  option is the longest, missing topic) and never block. Expected option counts moved into
  `ExamConfig`.
- alternatives: Keep everything as a hard error — rejected, it blocks valid questions.
  Make everything a warning — rejected, a question with no correct answer cannot be graded.
- consequences: Malformed mocks still cannot be sat; questionable ones can be, with the
  problem surfaced. The length-giveaway warning becomes the validator's most valuable
  output, since a question answerable by option length inflates every future score.

## ADR-003 — Unscored questions are reported as a range, not a single figure (2026-07-25)

- status: accepted
- context: The exam leaves 15 of its 65 questions unscored and never reveals which. The same
  answers can therefore produce materially different reported scores. A practice engine that
  ignores this trains against a number the real exam will not reproduce.
- decision: Apply the ratio proportionally (`round(n × 15/65)`) and report three views: the
  **true** score across every question as the headline, plus the **worst** case (unscored
  slots fall on correct answers) and the **best** case (they fall on wrong answers) as a
  range beneath it. A separate seeded **random** draw mirrors real behaviour. A setting
  chooses which figure decides pass or fail; the true score is always shown regardless.
- alternatives: Show only a random draw — rejected, the result then changes on every reload
  for identical answers, which is unusable as feedback. Show only the worst case — rejected,
  it hides the honest result. Ignore the mechanic — rejected, it is the difference between
  passing and failing at the margin.
- consequences: The result screen carries four numbers instead of one and must be designed
  not to overwhelm. The draw's seed lives on the attempt, so a resumed attempt cannot be
  reloaded into a better draw. The count is clamped to leave at least one scored question.

## ADR-002 — Time is derived from the wall clock, never from interval ticks (2026-07-25)

- status: accepted
- context: The previous engine decremented a counter once per `setInterval` tick. Browsers
  throttle timers in backgrounded tabs, so switching away from the exam silently granted
  extra time — the clock only advanced when the browser chose to deliver a tick.
- decision: Every time value is computed from `Date.now()` deltas held in a `Stopwatch`
  record. An interval may still drive repainting, but it is never the source of truth. All
  timer functions take `now` as a parameter, keeping them pure and directly testable.
- alternatives: Compensate for drift by comparing tick counts against elapsed time —
  rejected as strictly more complex than reading the clock in the first place.
- consequences: Backgrounding the tab now costs exactly the wall-clock time it took. Timer
  state is a plain serialisable record, which is also what crash-safe resume requires.

## ADR-001 — SvelteKit with a static adapter, replacing the single distributable file (2026-07-25)

- status: accepted
- context: The engine was one 919-line HTML file. That made it trivially portable but
  untestable, untyped, and impossible to review in parts. Growing it further — two exam
  modes, a richer prompt builder — was not viable in one file.
- decision: SvelteKit with `adapter-static`, TypeScript in strict mode, and Vitest. Output is
  a prerendered, client-rendered static site with no server, deployed to GitHub Pages.
- alternatives: Vite with a single-file plugin, which would have preserved a
  double-clickable `dist/exam.html` — a genuine loss, weighed and declined in favour of
  component ergonomics and a hosted URL reachable from a phone. Plain ES modules with no
  build — rejected because those cannot load over `file://` either, giving up the same
  property while providing no types and no test story.
- consequences: **Opening the page directly from the filesystem no longer works.** Use the
  dev server, the preview server, or the deployed site. A Node toolchain is now required.
  Component-level escaping removes the raw `innerHTML` interpolation the previous engine
  used for stems, option text and explanations.
