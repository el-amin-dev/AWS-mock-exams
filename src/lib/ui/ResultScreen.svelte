<script lang="ts">
	import { formatDuration } from '$lib/domain/timer';
	import type { UnscoredStrategy } from '$lib/domain/types';
	import type { ExamSession } from '$lib/state/session.svelte';

	const { session }: { session: ExamSession } = $props();

	const result = $derived(session.result);
	const report = $derived(session.report);

	const STRATEGY_LABELS: Record<UnscoredStrategy, string> = {
		off: 'every question counts',
		random: 'a random draw, as the real exam does',
		worst: 'the worst case',
		best: 'the best case'
	};

	/** Multi-answer questions that scored zero despite being partly right. */
	const partiallyRight = $derived(
		(result?.questions ?? []).filter(
			(question) =>
				question.type === 'multi' && question.outcome === 'wrong' && question.selected.length > 0
		).length
	);
	const blanks = $derived((result?.questions ?? []).filter((q) => q.outcome === 'blank').length);
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

{#if result && report}
	<div class="exam-panel">
		<h1>Results — {session.prepared?.mock.subtitle || session.prepared?.mock.title || 'Mock'}</h1>
		<p class="lead">
			Practice score. The real exam reports a scaled {session.config.scale.min}–{session.config
				.scale.max} with a {session.config.scale.pass} pass mark.
		</p>

		<div class="scorebox">
			<div class="headline" class:pass={result.verdict.passed} class:fail={!result.verdict.passed}>
				{result.raw.percent}%
			</div>
			<p class="headline-label">
				True score — {result.raw.correct} of {result.raw.total} correct
			</p>

			{#if result.unscoredCount > 0}
				<p class="range">
					With {result.unscoredCount}
					{result.unscoredCount === 1 ? 'question' : 'questions'} unscored, the exam could have reported
					<b>{result.worst.percent}% – {result.best.percent}%</b>
				</p>
			{/if}

			<p class="verdict" class:pass={result.verdict.passed} class:fail={!result.verdict.passed}>
				{result.verdict.passed ? 'PASS (practice)' : 'NOT YET (practice)'}
				· est. scaled {result.verdict.scaled} / {session.config.scale.max}
			</p>
			<p class="note">
				Judged on {STRATEGY_LABELS[result.verdict.strategy]} · time used {formatDuration(
					report.time.used_seconds
				)}
			</p>

			<label class="strategy">
				Judge my result on
				<select
					value={session.unscoredStrategy}
					onchange={(event) => session.setStrategy(event.currentTarget.value as UnscoredStrategy)}
				>
					<option value="random">a random draw (like the real exam)</option>
					<option value="worst">the worst case</option>
					<option value="best">the best case</option>
					<option value="off">every question (no unscored rule)</option>
				</select>
			</label>
		</div>

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

		<h2>By domain</h2>
		<table>
			<thead>
				<tr><th>Domain</th><th>Exam weight</th><th>Score</th><th>%</th></tr>
			</thead>
			<tbody>
				{#each result.byDomain as domain (domain.name)}
					<tr>
						<td>{domain.name}</td>
						<td>{domain.weight === undefined ? '—' : `${domain.weight}%`}</td>
						<td>{domain.correct}/{domain.total}</td>
						<td
							class:good={domain.percent >= session.config.passPercent}
							class:bad={domain.percent < session.config.passPercent}
						>
							{domain.percent}%
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h2>By topic</h2>
		<table>
			<thead>
				<tr><th>Topic</th><th>Score</th><th>%</th></tr>
			</thead>
			<tbody>
				{#each result.byTopic as topic (topic.name)}
					<tr>
						<td>{topic.name}</td>
						<td>{topic.correct}/{topic.total}</td>
						<td
							class:good={topic.percent >= session.config.passPercent}
							class:bad={topic.percent < session.config.passPercent}
						>
							{topic.percent}%
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h2>Report</h2>
		<p class="lead">
			Paste this into whatever generates your next mock. It carries your weak topics, per-question
			timing, and the unscored range.
		</p>
		<textarea readonly rows="10" value={reportJson}></textarea>
		<div class="actions">
			<button type="button" class="primary" onclick={copyReport}>Copy report</button>
			{#if copied}<span class="copied" aria-live="polite">Copied ✓</span>{/if}
		</div>
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
	.scorebox {
		text-align: center;
		padding: 24px;
		border: 1px solid var(--line);
		border-radius: 8px;
		margin-bottom: 22px;
	}

	.headline {
		font-size: 50px;
		font-weight: bold;
		line-height: 1;
	}

	.headline.pass {
		color: var(--ok);
	}

	.headline.fail {
		color: var(--bad);
	}

	.headline-label {
		font-size: 13px;
		color: var(--muted);
		margin-top: 6px;
	}

	.range {
		font-size: 12.5px;
		color: var(--muted);
		margin-top: 10px;
	}

	.verdict {
		font-size: 14px;
		font-weight: bold;
		margin-top: 12px;
	}

	.verdict.pass {
		color: var(--ok);
	}

	.verdict.fail {
		color: var(--bad);
	}

	.note {
		font-size: 12.5px;
		color: var(--muted);
		margin-top: 4px;
	}

	.strategy {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		font-size: 12.5px;
		color: var(--muted);
	}

	.strategy select {
		font-family: inherit;
		font-size: 12.5px;
		padding: 5px 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: #fff;
		color: var(--text);
	}

	h2 {
		font-size: 14px;
		color: var(--navy);
		margin: 22px 0 6px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		margin: 8px 0;
	}

	th,
	td {
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
	}

	th {
		color: var(--muted);
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	td.good {
		color: var(--ok);
		font-weight: bold;
	}

	td.bad {
		color: var(--bad);
		font-weight: bold;
	}

	textarea {
		width: 100%;
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
		margin-top: 8px;
	}

	.copied {
		color: var(--ok);
		font-size: 12.5px;
		font-weight: bold;
	}
</style>
