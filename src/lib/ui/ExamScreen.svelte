<script lang="ts">
	import { formatDuration } from '$lib/domain/timer';
	import type { ExamSession } from '$lib/state/session.svelte';
	import QuestionView from './QuestionView.svelte';

	const { session }: { session: ExamSession } = $props();

	const question = $derived(session.question);
	const tally = $derived(session.practiceTally);
	const isPractice = $derived(session.mode === 'practice');

	/** Answer letters, so the reveal can be announced to a screen reader. */
	const feedback = $derived.by(() => {
		if (!session.isRevealed || !question) return '';
		const expected = question.options
			.map((option, index) => (option.correct ? index : -1))
			.filter((index) => index >= 0);
		const selected = session.currentAnswer;
		const right =
			selected.length === expected.length && expected.every((index) => selected.includes(index));
		return right ? 'Correct.' : 'Incorrect. The explanation is shown below.';
	});

	/**
	 * Letter keys select an option, arrows navigate, F flags.
	 *
	 * Suppressed while a form control has focus, so typing into the paste box on another
	 * screen can never be mistaken for an answer.
	 */
	function onKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName.toLowerCase();
		if (
			tag === 'textarea' ||
			tag === 'select' ||
			(tag === 'input' && target?.getAttribute('type') === 'text')
		) {
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const key = event.key.toLowerCase();
		if (key === 'arrowright') {
			event.preventDefault();
			session.next();
		} else if (key === 'arrowleft') {
			event.preventDefault();
			session.previous();
		} else if (key === 'f') {
			event.preventDefault();
			session.flag();
		} else if (/^[a-h]$/.test(key) && question) {
			const index = key.charCodeAt(0) - 97;
			if (index < question.options.length) {
				event.preventDefault();
				session.select(index);
			}
		}
	}
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="exam-statusbar">
	<span class="count">Question {session.currentIndex + 1} of {session.total}</span>
	<div class="right">
		{#if isPractice}
			<span class="tally" aria-live="polite">
				{tally.correct} correct of {tally.answered} answered
			</span>
		{/if}
		<button
			type="button"
			class="flag-toggle"
			aria-pressed={session.isCurrentFlagged}
			onclick={() => session.flag()}
		>
			<span class="flag-icon" aria-hidden="true"></span>
			<span>{session.isCurrentFlagged ? 'Flagged' : 'Flag for Review'}</span>
		</button>
		<span
			class="exam-timer"
			class:low={session.isLowOnTime}
			role="timer"
			aria-live="off"
			aria-label={isPractice
				? `Elapsed time ${formatDuration(session.displaySeconds)}`
				: `Time remaining ${formatDuration(session.displaySeconds)}`}
		>
			{formatDuration(session.displaySeconds)}
		</span>
	</div>
</div>

<div class="exam-body">
	{#if question}
		<QuestionView
			{question}
			index={session.currentIndex}
			selected={session.currentAnswer}
			struck={session.currentStruck}
			required={session.requiredSelections}
			revealed={session.isRevealed}
			onselect={(index) => session.select(index)}
			onstrike={(index) => session.strike(index)}
		/>
		<p class="visually-hidden" aria-live="polite">{feedback}</p>
	{/if}
</div>

<div class="exam-footer">
	<div class="group">
		<button type="button" disabled={session.currentIndex === 0} onclick={() => session.previous()}>
			‹ Previous
		</button>
	</div>
	<div class="group">
		{#if isPractice && !session.isRevealed}
			<button
				type="button"
				class="primary"
				disabled={!session.canCheck}
				onclick={() => session.check()}
			>
				Check answer
			</button>
		{/if}
		<button type="button" onclick={() => session.showReview()}>Review Screen</button>
		<button
			type="button"
			class="primary"
			disabled={session.currentIndex === session.total - 1}
			onclick={() => session.next()}
		>
			Next ›
		</button>
	</div>
</div>

<style>
	.tally {
		font-size: 12.5px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
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
