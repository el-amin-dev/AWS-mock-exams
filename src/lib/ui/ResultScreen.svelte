<script lang="ts">
	import { formatDuration } from '$lib/domain/timer';
	import type { QuestionOutcome, UnscoredStrategy } from '$lib/domain/types';
	import type { ExamSession } from '$lib/state/session.svelte';
	import { loadResultView, saveResultView } from '$lib/session/result-view';
	import { defaultBackend } from '$lib/session/storage';

	const { session }: { session: ExamSession } = $props();

	const result = $derived(session.result);
	const report = $derived(session.report);
	const passMark = $derived(session.config.passPercent);

	const STRATEGY_LABELS: Record<UnscoredStrategy, string> = {
		off: 'every question counting',
		random: 'a random draw, as the real exam does',
		worst: 'the worst case',
		best: 'the best case'
	};

	const OUTCOME_LABELS: Record<QuestionOutcome, string> = {
		correct: 'Correct',
		wrong: 'Wrong',
		blank: 'Skipped'
	};

	/* ---------- remembered layout ---------- */

	const backend = defaultBackend();
	const storedView = loadResultView(backend);

	let density = $state(storedView.density);
	let domainsOpen = $state(storedView.domainsOpen);
	let topicsOpen = $state(storedView.topicsOpen);
	let questionsOpen = $state(storedView.questionsOpen);
	let reportOpen = $state(storedView.reportOpen);

	const compact = $derived(density === 'compact');

	$effect(() => {
		saveResultView(backend, { density, domainsOpen, topicsOpen, questionsOpen, reportOpen });
	});

	/* ---------- gauge geometry ---------- */

	/*
	 * A half-circle from 0% on the left to 100% on the right. Everything is drawn on the same
	 * arc so the reader compares positions rather than shapes: the filled arc is the true
	 * score, the wider translucent band behind it is the whole range the unscored rule could
	 * have produced, and the pass mark is a tick on the same line.
	 */
	const GAUGE_CX = 130;
	const GAUGE_CY = 126;
	const GAUGE_R = 96;

	function clampPercent(percent: number): number {
		return Math.min(100, Math.max(0, percent));
	}

	function pointAt(percent: number, radius: number): { x: number; y: number } {
		const angle = Math.PI * (1 - clampPercent(percent) / 100);
		return {
			x: GAUGE_CX + radius * Math.cos(angle),
			y: GAUGE_CY - radius * Math.sin(angle)
		};
	}

	/** An arc between two percentages. Never spans more than a half turn, so the flags are fixed. */
	function arcPath(from: number, to: number): string {
		const start = pointAt(from, GAUGE_R);
		const end = pointAt(to, GAUGE_R);
		return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
	}

	/** A radial tick centred on the arc, `reach` either side of it. */
	function tickPath(percent: number, reach: number): string {
		const inner = pointAt(percent, GAUGE_R - reach);
		const outer = pointAt(percent, GAUGE_R + reach);
		return `M ${inner.x.toFixed(2)} ${inner.y.toFixed(2)} L ${outer.x.toFixed(2)} ${outer.y.toFixed(2)}`;
	}

	const passLabelPoint = $derived.by(() => {
		const point = pointAt(passMark, GAUGE_R + 24);
		// Keep the label inside the viewBox when the pass mark sits near either end.
		return { x: Math.min(222, Math.max(38, point.x)), y: Math.max(14, point.y) };
	});

	const hasRange = $derived(
		!!result && result.unscoredCount > 0 && result.best.percent > result.worst.percent
	);

	/** What a screen reader is told instead of the drawing. */
	const gaugeDescription = $derived.by(() => {
		if (!result) return '';
		const range = hasRange
			? `With ${result.unscoredCount} of ${result.raw.total} questions unscored, the same answers could have been reported anywhere from ${result.worst.percent} to ${result.best.percent} percent. `
			: 'Every question counted, so there is no unscored spread. ';
		const verdict = result.verdict.passed ? 'a pass' : 'not yet a pass';
		return (
			`True score ${result.raw.percent} percent, ${result.raw.correct} of ${result.raw.total} correct. ` +
			range +
			`The pass mark is ${passMark} percent. Judged on ${STRATEGY_LABELS[result.verdict.strategy]}, ` +
			`this is ${result.verdict.percent} percent: ${verdict}.`
		);
	});

	/* ---------- breakdown rows ---------- */

	interface BarRow {
		readonly name: string;
		/** Secondary label shown beside the name, such as the official exam weight. */
		readonly meta: string;
		/** Short badge, empty when the row needs no warning. */
		readonly tag: string;
		readonly correct: number;
		readonly total: number;
		readonly percent: number;
	}

	/** Heaviest domain first: that is the order in which weaknesses are worth fixing. */
	const domainRows = $derived<BarRow[]>(
		[...(result?.byDomain ?? [])]
			.sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.name.localeCompare(b.name))
			.map((domain) => ({
				name: domain.name,
				meta: domain.weight === undefined ? 'unweighted' : `${domain.weight}% of the exam`,
				tag: domain.percent < passMark ? 'below pass' : '',
				correct: domain.correct,
				total: domain.total,
				percent: domain.percent
			}))
	);

	/** Weakest topic first: the top of this list is the next study session. */
	const topicRows = $derived<BarRow[]>(
		[...(result?.byTopic ?? [])]
			.sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name))
			.map((topic) => ({
				name: topic.name,
				meta: '',
				tag: (result?.weakTopics ?? []).includes(topic.name) ? 'weak' : '',
				correct: topic.correct,
				total: topic.total,
				percent: topic.percent
			}))
	);

	const weakCount = $derived(topicRows.filter((row) => row.tag !== '').length);

	/* ---------- tallies ---------- */

	const questions = $derived(result?.questions ?? []);
	/** Multi-answer questions that scored zero despite being partly right. */
	const partiallyRight = $derived(
		questions.filter(
			(question) =>
				question.type === 'multi' && question.outcome === 'wrong' && question.selected.length > 0
		).length
	);
	const wrongCount = $derived(questions.filter((q) => q.outcome === 'wrong').length);
	const blanks = $derived(questions.filter((q) => q.outcome === 'blank').length);
	const flaggedCount = $derived(questions.filter((q) => q.flagged).length);

	const reportJson = $derived(report ? JSON.stringify(report, null, 2) : '');

	let copied = $state(false);

	async function copyReport() {
		try {
			await navigator.clipboard.writeText(reportJson);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}
</script>

{#snippet scoreBar(row: BarRow)}
	{@const good = row.percent >= passMark}
	<li class="bar-row">
		<p class="bar-head">
			<span class="bar-name">{row.name}</span>
			{#if row.meta}<span class="bar-meta">{row.meta}</span>{/if}
			{#if row.tag}<span class="bar-tag">{row.tag}</span>{/if}
			<span class="bar-figure" class:good class:bad={!good}>{row.percent}%</span>
		</p>
		<span class="bar-track" aria-hidden="true">
			<span class="bar-fill" class:good class:bad={!good} style:width="{clampPercent(row.percent)}%"
			></span>
			<span class="bar-pass" style:left="{clampPercent(passMark)}%"></span>
		</span>
		{#if !compact}
			<p class="bar-sub">{row.correct} of {row.total} correct</p>
		{/if}
	</li>
{/snippet}

{#if result && report}
	<div class="exam-panel results" class:compact>
		<h1>Results — {session.prepared?.mock.subtitle || session.prepared?.mock.title || 'Mock'}</h1>
		<p class="lead">
			Practice score. The real exam reports a scaled {session.config.scale.min}–{session.config
				.scale.max} with a {session.config.scale.pass} pass mark.
		</p>

		<!-- ---------- the score itself ---------- -->
		<section class="hero" aria-label="Score summary">
			<div class="gauge">
				<svg viewBox="0 0 260 140" role="img" aria-labelledby="gauge-title gauge-desc">
					<title id="gauge-title">Score gauge</title>
					<desc id="gauge-desc">{gaugeDescription}</desc>

					<path class="track" d={arcPath(0, 100)} />

					{#if hasRange}
						<path class="band" d={arcPath(result.worst.percent, result.best.percent)} />
						<path class="band-edge" d={tickPath(result.worst.percent, 15)} />
						<path class="band-edge" d={tickPath(result.best.percent, 15)} />
					{/if}

					{#if result.raw.percent > 0}
						<path
							class="value"
							class:pass={result.verdict.passed}
							d={arcPath(0, result.raw.percent)}
						/>
					{/if}

					<path class="pass-tick" d={tickPath(passMark, 14)} />
					<text class="pass-label" x={passLabelPoint.x} y={passLabelPoint.y} text-anchor="middle">
						Pass {passMark}%
					</text>

					<text class="value-figure" x={GAUGE_CX} y={GAUGE_CY - 30} text-anchor="middle">
						{result.raw.percent}%
					</text>
					<text class="value-caption" x={GAUGE_CX} y={GAUGE_CY - 10} text-anchor="middle">
						TRUE SCORE
					</text>
				</svg>
			</div>

			<div class="hero-facts">
				<p class="chip" class:pass={result.verdict.passed} class:fail={!result.verdict.passed}>
					<span aria-hidden="true">{result.verdict.passed ? '✓' : '✕'}</span>
					{result.verdict.passed ? 'PASS (practice)' : 'NOT YET (practice)'}
				</p>
				<p class="scaled">
					Est. scaled <b>{result.verdict.scaled}</b> / {session.config.scale.max} ·
					{result.raw.correct} of {result.raw.total} correct
				</p>
				<p class="range">
					{#if hasRange}
						<b>{result.worst.percent}% – {result.best.percent}%</b> — with
						{result.unscoredCount}
						{result.unscoredCount === 1 ? 'question' : 'questions'} unscored, these exact answers could
						have been reported anywhere in that band.
					{:else}
						Every question counted, so there is no unscored spread on this mock.
					{/if}
				</p>
				<p class="basis">
					Verdict judged on {STRATEGY_LABELS[result.verdict.strategy]}:
					<b>{result.verdict.percent}%</b> against a {passMark}% pass mark.
				</p>
			</div>
		</section>

		<!-- ---------- customisation ---------- -->
		<div class="controls">
			<label class="control">
				<span>Judge my result on</span>
				<select
					value={session.unscoredStrategy}
					onchange={(event) => session.setStrategy(event.currentTarget.value as UnscoredStrategy)}
				>
					<option value="worst">the worst case</option>
					<option value="random">a random draw (like the real exam)</option>
					<option value="best">the best case</option>
					<option value="off">every question (no unscored rule)</option>
				</select>
			</label>

			<div class="control" role="group" aria-label="Level of detail">
				<span>Detail</span>
				<button
					type="button"
					class="toggle"
					aria-pressed={compact}
					onclick={() => (density = 'compact')}>Compact</button
				>
				<button
					type="button"
					class="toggle"
					aria-pressed={!compact}
					onclick={() => (density = 'detailed')}>Detailed</button
				>
			</div>
		</div>

		<!-- ---------- key stats ---------- -->
		<ul class="stat-grid">
			<li class="stat">
				<p class="label">Correct</p>
				<p class="value">{result.raw.correct} / {result.raw.total}</p>
				<p class="hint">{result.raw.percent}% true score</p>
			</li>
			<li class="stat">
				<p class="label">Unscored</p>
				<p class="value">{result.unscoredCount}</p>
				<p class="hint">
					{result.unscoredCount === 0
						? 'every question counted'
						: `of ${result.raw.total} did not count`}
				</p>
			</li>
			<li class="stat">
				<p class="label">Time used</p>
				<p class="value">{formatDuration(report.time.used_seconds)}</p>
				<p class="hint">of {formatDuration(report.time.allotted_seconds)} allotted</p>
			</li>
			<li class="stat">
				<p class="label">Per question</p>
				<p class="value">{formatDuration(report.pacing.average_seconds_per_question)}</p>
				<p class="hint">
					budget {formatDuration(report.pacing.budget_seconds_per_question)}
				</p>
			</li>
		</ul>

		{#if partiallyRight > 0}
			<div class="callout warn">
				<b>No partial credit:</b>
				{partiallyRight} multi-answer
				{partiallyRight === 1 ? 'question' : 'questions'} scored <b>0</b> because the selection was not
				exactly right. On the real exam, "Select TWO" is all or nothing.
			</div>
		{/if}

		{#if blanks > 0}
			<div class="callout warn">
				<b>{blanks} blank {blanks === 1 ? 'answer' : 'answers'}.</b> Blanks score as wrong and there is
				no penalty for guessing — never leave one empty on the real exam.
			</div>
		{/if}

		{#if !compact}
			<div class="callout info">
				<b>Pacing:</b>
				{formatDuration(report.pacing.average_seconds_per_question)} average per question against a
				{formatDuration(report.pacing.budget_seconds_per_question)} budget.
				{#if report.pacing.slow_questions.length > 0}
					Slowest: Q{report.pacing.slow_questions.join(', Q')}.
				{:else}
					No question ran long — good control.
				{/if}
			</div>
		{/if}

		<!-- ---------- by domain ---------- -->
		<details class="section" bind:open={domainsOpen}>
			<summary>
				<span class="summary-title">By domain</span>
				<span class="summary-meta">{domainRows.length} weighted areas</span>
			</summary>
			<p class="section-note">
				Heaviest first. A weak domain worth 30% of the exam costs more marks than the same score in
				one worth 20%, so fix the top of this list before the bottom. The upright line on each bar
				is the {passMark}% pass mark.
			</p>
			<ul class="bars">
				{#each domainRows as row (row.name)}
					{@render scoreBar(row)}
				{/each}
			</ul>
		</details>

		<!-- ---------- by topic ---------- -->
		<details class="section" bind:open={topicsOpen}>
			<summary>
				<span class="summary-title">By topic</span>
				<span class="summary-meta">
					{weakCount}
					{weakCount === 1 ? 'weak topic' : 'weak topics'}
				</span>
			</summary>
			<p class="section-note">
				Weakest first. Anything marked <b>weak</b> sits below the pass mark and is carried into the next
				generated mock as review questions.
			</p>
			<ul class="bars">
				{#each topicRows as row (row.name)}
					{@render scoreBar(row)}
				{/each}
			</ul>
		</details>

		<!-- ---------- every question ---------- -->
		<details class="section" bind:open={questionsOpen}>
			<summary>
				<span class="summary-title">Every question</span>
				<span class="summary-meta">
					{result.raw.correct} correct · {wrongCount} wrong · {blanks} skipped
				</span>
			</summary>
			<p class="section-note">
				Select any question to reopen it with its explanation. {flaggedCount}
				{flaggedCount === 1 ? 'question was' : 'questions were'} flagged.
			</p>
			<ul class="legend">
				<li><span class="swatch correct"></span> Correct</li>
				<li><span class="swatch wrong"></span> Wrong</li>
				<li><span class="swatch blank"></span> Skipped</li>
				<li><span class="swatch flagged-swatch"></span> Flagged</li>
			</ul>
			<ul class="q-strip">
				{#each questions as question (question.position)}
					<li>
						<button
							type="button"
							class="review-cell {question.outcome}"
							class:flagged={question.flagged}
							aria-label="Question {question.position}, {OUTCOME_LABELS[
								question.outcome
							]}{question.flagged ? ', flagged' : ''}"
							onclick={() => session.goTo(question.position - 1)}
						>
							{#if question.flagged}
								<span class="flag-corner" aria-hidden="true"></span>
							{/if}
							{question.position}
							{#if !compact}
								<span class="state">{OUTCOME_LABELS[question.outcome]}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</details>

		<!-- ---------- the machine-readable report ---------- -->
		<details class="section" bind:open={reportOpen}>
			<summary>
				<span class="summary-title">Report (JSON)</span>
				<span class="summary-meta">for the next generator</span>
			</summary>
			<p class="section-note">
				Paste this into whatever generates your next mock. It carries your weak topics, per-question
				timing, and the unscored range.
			</p>
			<textarea readonly rows="10" value={reportJson}></textarea>
			<div class="actions">
				<button type="button" class="primary" onclick={copyReport}>Copy report</button>
				{#if copied}<span class="copied" aria-live="polite">Copied ✓</span>{/if}
			</div>
		</details>
	</div>

	<div class="exam-footer">
		<div class="group">
			<button type="button" onclick={() => session.reviewAnswers()}>Review My Answers</button>
		</div>
		<div class="group">
			<button type="button" onclick={() => session.reset()}>Load another mock</button>
		</div>
	</div>
{/if}

<style>
	/* ---------- hero ---------- */

	.hero {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 26px;
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 18px 22px;
		margin-bottom: 16px;
	}

	.gauge {
		flex: 1 1 240px;
		max-width: 300px;
		min-width: 200px;
	}

	.gauge svg {
		width: 100%;
		height: auto;
		display: block;
	}

	.track {
		fill: none;
		stroke: var(--bar);
		stroke-width: 14;
	}

	/*
	 * The range is drawn as a wider, translucent band on the same arc rather than a second
	 * ring, so it reads as "the score could have landed anywhere along here" instead of as an
	 * unrelated measurement.
	 */
	.band {
		fill: none;
		stroke: var(--blue);
		stroke-width: 30;
		stroke-opacity: 0.24;
	}

	.band-edge {
		stroke: var(--blue-dark);
		stroke-width: 1.5;
		stroke-opacity: 0.65;
	}

	.value {
		fill: none;
		stroke: var(--bad);
		stroke-width: 14;
		stroke-linecap: round;
	}

	.value.pass {
		stroke: var(--ok);
	}

	.pass-tick {
		stroke: var(--navy);
		stroke-width: 2.5;
	}

	.pass-label {
		fill: var(--navy);
		font-size: 11px;
		font-weight: bold;
	}

	.value-figure {
		fill: var(--navy);
		font-size: 44px;
		font-weight: bold;
	}

	.value-caption {
		fill: var(--muted);
		font-size: 10.5px;
		letter-spacing: 1px;
	}

	.hero-facts {
		flex: 1 1 260px;
		min-width: 0;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: bold;
		padding: 4px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
	}

	.chip.pass {
		background: var(--ok-bg);
		border-color: var(--ok);
		color: var(--ok);
	}

	.chip.fail {
		background: var(--bad-bg);
		border-color: var(--bad);
		color: var(--bad);
	}

	.scaled {
		font-size: 13.5px;
		margin-top: 8px;
	}

	.range,
	.basis {
		font-size: 12.5px;
		color: var(--muted);
		margin-top: 6px;
	}

	/* ---------- controls ---------- */

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 20px;
		align-items: center;
		margin-bottom: 16px;
		font-size: 12.5px;
		color: var(--muted);
	}

	.control {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.control select {
		font-family: inherit;
		font-size: 12.5px;
		padding: 5px 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: #fff;
		color: var(--text);
		max-width: 100%;
	}

	.toggle {
		font-size: 12px !important;
		font-weight: normal !important;
		padding: 4px 12px !important;
		border-color: var(--line) !important;
		color: var(--muted) !important;
	}

	.toggle[aria-pressed='true'] {
		background: var(--bar) !important;
		border-color: var(--navy) !important;
		color: var(--navy) !important;
		font-weight: bold !important;
	}

	.stat .hint {
		font-size: 11.5px;
		color: var(--muted);
		margin-top: 3px;
	}

	.stat-grid {
		list-style: none;
		padding: 0;
	}

	/* ---------- collapsible sections ---------- */

	.section {
		border: 1px solid var(--line);
		border-radius: 8px;
		margin-bottom: 12px;
	}

	.section summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		padding: 11px 14px;
		cursor: pointer;
		list-style-position: inside;
	}

	.section summary:hover {
		background: var(--bar);
	}

	.summary-title {
		font-size: 14px;
		font-weight: bold;
		color: var(--navy);
	}

	.summary-meta {
		font-size: 12px;
		color: var(--muted);
	}

	.section-note {
		font-size: 12.5px;
		color: var(--muted);
		padding: 0 14px;
		margin-bottom: 12px;
	}

	.section > :last-child {
		margin-bottom: 14px;
	}

	/* ---------- bars ---------- */

	.bars {
		list-style: none;
		padding: 0 14px;
		margin: 0;
	}

	.bar-row + .bar-row {
		margin-top: 12px;
	}

	.compact .bar-row + .bar-row {
		margin-top: 7px;
	}

	.bar-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 8px;
		font-size: 13px;
		margin-bottom: 4px;
	}

	.bar-name {
		font-weight: bold;
		color: var(--navy);
	}

	.bar-meta {
		font-size: 11.5px;
		color: var(--muted);
	}

	.bar-tag {
		font-size: 10.5px;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		padding: 1px 6px;
		border-radius: 3px;
		background: var(--bad-bg);
		border: 1px solid var(--bad);
		color: var(--bad);
	}

	.bar-figure {
		margin-left: auto;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
	}

	.bar-figure.good {
		color: var(--ok);
	}

	.bar-figure.bad {
		color: var(--bad);
	}

	.bar-track {
		display: block;
		position: relative;
		height: 12px;
		border-radius: 3px;
		background: var(--bar);
		border: 1px solid var(--line);
		overflow: hidden;
	}

	.bar-fill {
		display: block;
		height: 100%;
	}

	.bar-fill.good {
		background: var(--ok);
	}

	.bar-fill.bad {
		background: var(--bad);
	}

	/* The pass mark, drawn on every bar so each score is read against the same line. */
	.bar-pass {
		position: absolute;
		top: -1px;
		bottom: -1px;
		width: 2px;
		margin-left: -1px;
		background: var(--navy);
	}

	.bar-sub {
		font-size: 11.5px;
		color: var(--muted);
		margin-top: 3px;
	}

	/* ---------- question strip ---------- */

	.legend {
		padding: 0 14px;
		margin-bottom: 12px;
	}

	.q-strip {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 6px;
		list-style: none;
		padding: 0 14px;
		margin: 0;
	}

	.compact .q-strip {
		grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
	}

	.q-strip .review-cell {
		padding: 6px 2px;
		font-size: 12px;
	}

	.swatch.correct {
		background: var(--ok-bg);
		border-color: var(--ok);
	}

	.swatch.wrong {
		background: var(--bad-bg);
		border-color: var(--bad);
	}

	.swatch.blank {
		background: #fff;
	}

	/* Flagging is a corner marker rather than a fill, so it reads at the same time as the
	   answer state underneath it — the same language the review screen uses. */
	.swatch.flagged-swatch {
		background: #fff;
		position: relative;
		overflow: hidden;
	}

	.swatch.flagged-swatch::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		border-width: 0 7px 7px 0;
		border-style: solid;
		border-color: transparent var(--flag) transparent transparent;
	}

	.flag-corner {
		position: absolute;
		top: 0;
		right: 0;
		border-width: 0 10px 10px 0;
		border-style: solid;
		border-color: transparent var(--flag) transparent transparent;
	}

	/* ---------- report ---------- */

	textarea {
		width: calc(100% - 28px);
		margin: 0 14px;
		font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
		font-size: 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 12px;
		background: #0f1721;
		color: #cfe3ff;
		resize: vertical;
		line-height: 1.45;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 8px 14px 0;
	}

	.copied {
		color: var(--ok);
		font-size: 12.5px;
		font-weight: bold;
	}

	@media (max-width: 520px) {
		.hero {
			padding: 14px;
		}

		.gauge {
			max-width: none;
		}
	}
</style>
