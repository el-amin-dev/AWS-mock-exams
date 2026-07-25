<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { APP_NAME } from '$lib/constants';
	import { ExamSession } from '$lib/state/session.svelte';
	import ExamScreen from '$lib/ui/ExamScreen.svelte';
	import HomeScreen from '$lib/ui/HomeScreen.svelte';
	import ReadyScreen from '$lib/ui/ReadyScreen.svelte';
	import ResultScreen from '$lib/ui/ResultScreen.svelte';
	import ReviewScreen from '$lib/ui/ReviewScreen.svelte';

	const session = new ExamSession();

	const heading = $derived(
		session.prepared
			? `${session.prepared.mock.title ?? APP_NAME}${
					session.prepared.mock.subtitle ? ` · ${session.prepared.mock.subtitle}` : ''
				}`
			: APP_NAME
	);

	onMount(() => session.checkForResumable());
	onDestroy(() => session.dispose());

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
		<HomeScreen {session} />
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
