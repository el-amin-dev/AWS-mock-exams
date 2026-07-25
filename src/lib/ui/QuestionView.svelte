<script lang="ts">
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
		onselect: (optionIndex: number) => void;
		onstrike: (optionIndex: number) => void;
	}

	const { question, index, selected, struck, required, revealed, onselect, onstrike }: Props =
		$props();

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
	<p class="question-instruction">{instruction}</p>

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
