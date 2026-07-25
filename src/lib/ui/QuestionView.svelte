<script lang="ts">
	import { tipsFor } from '$lib/domain/tips';
	import { OPTION_LABELS } from '$lib/domain/validation';
	import type { Question } from '$lib/domain/types';

	interface Props {
		question: Question;
		index: number;
		/** Option indices currently selected. */
		selected: readonly number[];
		/** Option indices struck out as elimination aids. */
		struck: readonly number[];
		/** How many options this question expects. */
		required: number;
		/** Whether the answer has been graded and revealed. */
		revealed: boolean;
		/** Whether study aids are offered. Practice mode only; the real exam has none. */
		tipsAvailable?: boolean;
		onselect: (optionIndex: number) => void;
		onstrike: (optionIndex: number) => void;
	}

	const {
		question,
		index,
		selected,
		struck,
		required,
		revealed,
		tipsAvailable = false,
		onselect,
		onstrike
	}: Props = $props();

	let tipsOpen = $state(false);
	const tips = $derived(tipsFor(question, required));

	// Collapse the panel when moving to another question, so help is always asked for.
	$effect(() => {
		void index;
		tipsOpen = false;
	});

	const NUMBER_WORDS: Record<number, string> = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR' };

	const inputType = $derived(required > 1 ? 'checkbox' : 'radio');
	const instruction = $derived(
		required > 1 ? `Choose ${NUMBER_WORDS[required] ?? required} answers.` : 'Choose ONE answer.'
	);
	const groupName = $derived(`question-${index}`);

	/** Classifies an option once the answer has been revealed. */
	function outcomeOf(optionIndex: number): 'correct' | 'incorrect' | null {
		if (!revealed) return null;
		if (question.options[optionIndex]?.correct) return 'correct';
		return selected.includes(optionIndex) ? 'incorrect' : null;
	}
</script>

<fieldset class="question-fieldset">
	<legend class="visually-hidden">Question {index + 1}</legend>

	{#if revealed}
		<p class="question-meta">
			Topic: {question.topic}{question.domain ? ` · Domain: ${question.domain}` : ''}
		</p>
	{/if}

	<p class="question-stem">{question.stem}</p>

	<div class="instruction-row">
		<p class="question-instruction">{instruction}</p>
		{#if tipsAvailable && !revealed}
			<button
				type="button"
				class="tips-button"
				aria-expanded={tipsOpen}
				aria-controls="tips-{index}"
				onclick={() => (tipsOpen = !tipsOpen)}
			>
				<span class="tips-icon" aria-hidden="true">i</span>
				{tipsOpen ? 'Hide help' : 'Stuck?'}
			</button>
		{/if}
	</div>

	{#if tipsAvailable && tipsOpen && !revealed}
		<div class="tips" id="tips-{index}">
			{#each tips as tip (tip.label)}
				<p><b>{tip.label}.</b> {tip.body}</p>
			{/each}
			<p class="tips-note">
				None of this is available in exam mode — this is here so being stuck teaches you something
				rather than costing you a guess.
			</p>
		</div>
	{/if}

	<div class="option-list">
		{#each question.options as option, optionIndex (optionIndex)}
			{@const id = `q${index}-option-${optionIndex}`}
			{@const outcome = outcomeOf(optionIndex)}
			{@const isStruck = !revealed && struck.includes(optionIndex)}
			<div
				class="option"
				class:struck={isStruck}
				class:correct={outcome === 'correct'}
				class:incorrect={outcome === 'incorrect'}
			>
				<input
					{id}
					type={inputType}
					name={groupName}
					checked={selected.includes(optionIndex)}
					disabled={revealed}
					onchange={() => onselect(optionIndex)}
				/>
				<label for={id} class="option-label">
					<span class="letter">{OPTION_LABELS[optionIndex] ?? optionIndex + 1}</span>
					<span class="body">
						{option.text}
						{#if outcome === 'correct'}<span class="tag ok">Correct</span>{/if}
						{#if outcome === 'incorrect'}<span class="tag bad">Your choice</span>{/if}
					</span>
				</label>
				{#if !revealed}
					<button
						type="button"
						class="strike-button"
						aria-pressed={isStruck}
						onclick={() => onstrike(optionIndex)}
					>
						{isStruck ? 'Undo' : 'Strike'}
						<span class="visually-hidden">
							option {OPTION_LABELS[optionIndex] ?? optionIndex + 1}
						</span>
					</button>
				{/if}
			</div>
		{/each}
	</div>

	{#if revealed}
		<div class="explanation">
			<h3>Why each option is right or wrong</h3>
			{#each question.options as option, optionIndex (optionIndex)}
				<p><b>{OPTION_LABELS[optionIndex] ?? optionIndex + 1}.</b> {option.why}</p>
			{/each}
		</div>
	{/if}
</fieldset>

<style>
	.option-label {
		display: flex;
		gap: 12px;
		flex: 1;
		cursor: pointer;
	}

	.instruction-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.tips-button {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px !important;
		padding: 4px 10px !important;
		border-color: var(--line) !important;
		color: var(--blue-dark) !important;
	}

	.tips-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: var(--blue);
		color: #fff;
		font-style: italic;
		font-size: 11px;
		font-weight: bold;
	}

	.tips {
		border: 1px solid #bcd4ee;
		background: #eef5fc;
		border-radius: 6px;
		padding: 12px 15px;
		margin-bottom: 14px;
		font-size: 13px;
	}

	.tips p {
		margin: 4px 0;
	}

	.tips b {
		color: var(--blue-dark);
	}

	.tips-note {
		color: var(--muted);
		font-size: 12px;
		font-style: italic;
		margin-top: 10px !important;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
