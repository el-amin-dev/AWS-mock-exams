<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { APP_NAME } from '$lib/constants';
	import { ExamSession } from '$lib/state/session.svelte';
	import { PromptStudio } from '$lib/state/studio.svelte';
	import ExamScreen from '$lib/ui/ExamScreen.svelte';
	import HomeScreen from '$lib/ui/HomeScreen.svelte';
	import PromptScreen from '$lib/ui/PromptScreen.svelte';
	import ReadyScreen from '$lib/ui/ReadyScreen.svelte';
	import ResultScreen from '$lib/ui/ResultScreen.svelte';
	import ReviewScreen from '$lib/ui/ReviewScreen.svelte';

	const session = new ExamSession();
	const studio = new PromptStudio();

	/**
	 * Which home tab is showing.
	 *
	 * The studio leads, because it is the first step of the loop: build a prompt, generate a
	 * mock elsewhere, come back and load it. Someone arriving with a file already in hand is
	 * one click from the other tab.
	 */
	let homeTab = $state<'prompt' | 'load'>('prompt');

	const heading = $derived(
		session.prepared
			? `${session.prepared.mock.title ?? APP_NAME}${
					session.prepared.mock.subtitle ? ` · ${session.prepared.mock.subtitle}` : ''
				}`
			: APP_NAME
	);

	onMount(() => {
		session.checkForResumable();
		// A saved attempt is the only thing more urgent than building the next prompt.
		if (session.resumable) homeTab = 'load';
	});
	onDestroy(() => session.dispose());

	/**
	 * Feeds a graded result back into the studio.
	 *
	 * This is what closes the loop: whatever scored below the pass mark is carried into the
	 * next prompt automatically, with nothing to remember or copy across.
	 */
	$effect(() => {
		if (session.view === 'result' && session.report) studio.recordReport(session.report);
	});

	/**
	 * Confirms before grading, listing what is outstanding.
	 *
	 * Ending an exam is irreversible, and the count of unanswered and flagged questions is
	 * exactly what a candidate needs in order to decide.
	 */
	function confirmSubmit() {
		const outstanding = session.unansweredCount;
		const flagged = session.flaggedCount;
		const preamble =
			outstanding || flagged
				? `You have ${outstanding} unanswered or incomplete and ${flagged} flagged question(s).\n\n`
				: '';
		if (
			confirm(`${preamble}End the exam and score it now?\n\nYou cannot return to the questions.`)
		) {
			session.submit();
		}
	}

	/** Warns before a reload would abandon a sitting that is still in progress. */
	function guardUnload(event: BeforeUnloadEvent) {
		if (session.view === 'exam' || session.view === 'review') event.preventDefault();
	}
</script>

<svelte:head>
	<title>{heading}</title>
	<meta
		name="description"
		content="Course-agnostic mock exam engine with a faithful exam mode and a practice mode."
	/>
</svelte:head>

<svelte:window on:beforeunload={guardUnload} />

<main class="exam-surface">
	<div class="exam-topbar">
		<span class="name">{heading}</span>
		<span class="candidate">
			{session.view === 'exam' || session.view === 'review'
				? session.mode === 'practice'
					? 'Practice'
					: 'Exam'
				: 'Candidate: You'}
		</span>
	</div>

	{#if session.view === 'home'}
		<div class="tabs" role="tablist" aria-label="Home">
			<button
				type="button"
				role="tab"
				aria-selected={homeTab === 'prompt'}
				class:active={homeTab === 'prompt'}
				onclick={() => (homeTab = 'prompt')}
			>
				① Build a prompt
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={homeTab === 'load'}
				class:active={homeTab === 'load'}
				onclick={() => (homeTab = 'load')}
			>
				② Load a mock &amp; sit it
			</button>
		</div>

		{#if homeTab === 'prompt'}
			<PromptScreen {studio} />
		{:else}
			<HomeScreen {session} />
		{/if}
	{:else if session.view === 'ready'}
		<ReadyScreen {session} />
	{:else if session.view === 'review'}
		<ReviewScreen {session} onsubmit={confirmSubmit} />
	{:else if session.view === 'result'}
		<ResultScreen {session} />
	{:else}
		<ExamScreen {session} />
	{/if}
</main>

<style>
	.tabs {
		display: flex;
		gap: 0;
		background: var(--bar);
		border-bottom: 1px solid var(--line);
		padding: 0 16px;
		flex: none;
	}

	.tabs button {
		border: none;
		border-bottom: 3px solid transparent;
		background: none;
		color: var(--muted);
		padding: 11px 16px;
		font-size: 13px;
		font-weight: bold;
		border-radius: 0;
	}

	.tabs button:hover {
		background: #e2e7ec;
		color: var(--navy);
	}

	.tabs button.active {
		color: var(--navy);
		border-bottom-color: var(--blue);
		background: #fff;
	}
</style>
