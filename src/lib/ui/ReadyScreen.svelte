<script lang="ts">
	import { unscoredCount } from '$lib/domain/scoring';
	import { formatDuration } from '$lib/domain/timer';
	import type { ExamSession } from '$lib/state/session.svelte';

	const { session }: { session: ExamSession } = $props();

	const isPractice = $derived(session.mode === 'practice');
	const multiCount = $derived(
		session.questions.filter((q) => q.options.filter((o) => o.correct).length > 1).length
	);
	const unscored = $derived(unscoredCount(session.total, session.config.unscoredRatio));
	const topics = $derived(session.prepared?.mock.topics_covered ?? []);
</script>

<div class="exam-panel">
	<h1>{session.prepared?.mock.subtitle || session.prepared?.mock.title || 'Ready to start'}</h1>
	<p class="lead">
		{#if isPractice}
			Practice mode. The timer counts up and nothing is cut short — answer, check, and read the
			explanation before moving on.
		{:else}
			Exam mode. The clock starts only when you select Start, and topics stay hidden until you
			submit, exactly as in the real test.
		{/if}
	</p>

	<div class="stat-grid">
		<div class="stat">
			<div class="label">Questions</div>
			<div class="value">{session.total}</div>
		</div>
		<div class="stat">
			<div class="label">Multi-answer</div>
			<div class="value">{multiCount}</div>
		</div>
		<div class="stat">
			<div class="label">{isPractice ? 'Time' : 'Time limit'}</div>
			<div class="value">{isPractice ? 'Untimed' : formatDuration(session.timeLimitSeconds)}</div>
		</div>
		<div class="stat">
			<div class="label">Pass mark</div>
			<div class="value">{session.config.passPercent}%</div>
		</div>
	</div>

	{#if unscored > 0}
		<div class="callout info">
			<b>{unscored} of these {session.total} questions will not count.</b> The real exam leaves 15 of
			its 65 unscored and never says which, so the same answers can produce different results. Your true
			score is reported either way, with the range this rule could have produced shown alongside it.
		</div>
	{/if}

	{#if topics.length > 0}
		<p><b>Topics covered</b></p>
		<ul class="topics">
			{#each topics as topic (topic)}
				<li>{topic}</li>
			{/each}
		</ul>
	{/if}
</div>

<div class="exam-footer">
	<div class="group">
		<button type="button" onclick={() => session.reset()}>‹ Back</button>
	</div>
	<div class="group">
		<button type="button" class="primary" onclick={() => session.start()}>
			▶ Start {isPractice ? 'Practice' : 'Exam'}
		</button>
	</div>
</div>

<style>
	.topics {
		font-size: 13.5px;
		margin: 8px 0 0 20px;
	}

	.topics li {
		margin: 3px 0;
	}
</style>
