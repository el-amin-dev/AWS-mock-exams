<script lang="ts">
	import type { ExamSession } from '$lib/state/session.svelte';

	const { session, onsubmit }: { session: ExamSession; onsubmit: () => void } = $props();

	/** Wording shown under each number. */
	const STATE_LABELS = {
		correct: 'Correct',
		wrong: 'Wrong',
		blank: 'Skipped',
		answered: 'Answered',
		partial: 'Incomplete'
	} as const;

	const graded = $derived(session.isGraded);
	const states = $derived(
		Array.from({ length: session.total }, (_, index) => session.questionState(index))
	);
	const skippedTotal = $derived(states.filter((state) => state === 'blank').length);
	const partialTotal = $derived(states.filter((state) => state === 'partial').length);
</script>

<div class="exam-panel">
	<h1>Review Screen</h1>
	<p class="lead">
		Select any question to return to it. When you are ready, end the exam to see your score, the
		explanations, and the report.
	</p>

	<ul class="legend">
		{#if graded}
			<li><span class="swatch correct"></span> Correct</li>
			<li><span class="swatch wrong"></span> Wrong</li>
		{:else}
			<li><span class="swatch answered"></span> Answered</li>
			<li><span class="swatch partial"></span> Incomplete</li>
		{/if}
		<li><span class="swatch blank"></span> Skipped</li>
		<li><span class="swatch flagged-swatch"></span> Flagged</li>
	</ul>

	<p class="summary">
		{skippedTotal} skipped · {partialTotal} incomplete · {session.flaggedCount} flagged
		{#if skippedTotal > 0}
			<span class="nudge">
				— a skipped question scores exactly as a wrong one, so guess rather than leave it.
			</span>
		{/if}
	</p>

	<ul class="review-grid">
		{#each Array.from({ length: session.total }, (_, i) => i) as index (index)}
			{@const state = states[index] ?? 'blank'}
			{@const flagged = session.attempt?.flags[index] ?? false}
			<li>
				<button
					type="button"
					class="review-cell {state}"
					class:flagged
					onclick={() => session.goTo(index)}
				>
					{#if flagged}
						<span class="flag-corner" aria-hidden="true"></span>
					{/if}
					{index + 1}
					<span class="state">{STATE_LABELS[state]}</span>
					<span class="visually-hidden">{flagged ? ', flagged' : ''}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<div class="exam-footer">
	<div class="group">
		<button type="button" onclick={() => session.backToQuestions()}>‹ Back to Questions</button>
	</div>
	<div class="group">
		<button type="button" class="primary" onclick={onsubmit}>End Exam &amp; Score</button>
	</div>
</div>

<style>
	.summary {
		font-size: 12.5px;
		color: var(--muted);
		margin-bottom: 14px;
	}

	.nudge {
		color: var(--warn);
	}

	.swatch.answered {
		background: #eef6ee;
		border-color: #bcd9bc;
	}

	.swatch.correct {
		background: var(--ok-bg);
		border-color: var(--ok);
	}

	.swatch.wrong {
		background: var(--bad-bg);
		border-color: var(--bad);
	}

	.swatch.partial {
		background: var(--warn-bg);
		border-color: #e6c89a;
	}

	.swatch.blank {
		background: #fff;
	}

	/*
	 * Flagging is drawn as a corner marker rather than a fill, so it reads at the same time
	 * as the answer state underneath it. Previously a flag replaced the answer colour, which
	 * hid the one combination that matters most before time runs out: flagged and still blank.
	 */
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
		border-width: 0 12px 12px 0;
		border-style: solid;
		border-color: transparent var(--flag) transparent transparent;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
