<script lang="ts">
	import type { PromptStudio } from '$lib/state/studio.svelte';

	const { studio }: { studio: PromptStudio } = $props();

	let copied = $state(false);
	let copyFailed = $state(false);

	const topics = $derived(studio.topics);
	const weakTopics = $derived(studio.weakTopics);
	const prompt = $derived(studio.prompt);

	/** The clock the generated mock will carry: one question is worth 120 seconds. */
	const minutes = $derived(Math.round((studio.questionCount * 120) / 60));

	/** Multi-line, so it has to be a value rather than a literal attribute. */
	const TOPICS_PLACEHOLDER =
		'VPC routing and NAT gateways\nEBS volume types\nIAM roles and instance profiles';

	async function copyPrompt() {
		copyFailed = false;
		try {
			await navigator.clipboard.writeText(prompt);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard access is refused in some contexts; fall back to selecting the text
			// so it can still be copied by hand.
			copyFailed = true;
			document.querySelector<HTMLTextAreaElement>('#prompt-output')?.select();
		}
	}

	function downloadPrompt() {
		const blob = new Blob([prompt], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'mock-prompt.txt';
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}
</script>

<div class="exam-panel">
	<h1>Build the prompt for your next mock</h1>
	<p class="lead">
		Paste the topics you studied, adjust the numbers, then copy the prompt into whichever assistant
		you use. Save its reply as a <code>.json</code> file and load it from the other tab.
	</p>

	<label class="field" for="topics">
		<span class="label">1. Topics you studied</span>
		<span class="hint">
			One per line. Bullets, numbering and trailing timestamps are stripped for you, so pasting
			straight from a lesson list works.
		</span>
		<textarea
			id="topics"
			rows="8"
			bind:value={studio.topicsText}
			oninput={() => studio.persist()}
			placeholder={TOPICS_PLACEHOLDER}></textarea>
	</label>

	{#if topics.length > 0}
		<p class="parsed">
			<b>{topics.length} {topics.length === 1 ? 'topic' : 'topics'}</b> — {topics.join(' · ')}
		</p>
	{/if}

	{#if weakTopics.length > 0}
		<div class="callout info carry">
			<div>
				<b>Carried forward from your last result:</b>
				{weakTopics.join(' · ')}
				<br />
				<small>
					The prompt asks for {studio.reviewQuestionCount} review question{studio.reviewQuestionCount ===
					1
						? ''
						: 's'} on these, mixed in randomly.
				</small>
			</div>
			<button type="button" onclick={() => studio.forgetLastReport()}>Forget these</button>
		</div>
	{/if}

	<fieldset class="controls">
		<legend>2. Shape of the mock</legend>
		<label>
			<span>Questions</span>
			<input
				type="number"
				min="1"
				max="200"
				bind:value={studio.questionCount}
				onchange={() => studio.persist()}
			/>
		</label>
		<label>
			<span>
				Multi-answer
				{#if studio.multiAnswerIsAutomatic}
					<em>auto</em>
				{/if}
			</span>
			<input
				type="number"
				min="0"
				max="200"
				value={studio.multiAnswerCount}
				onchange={(event) => {
					studio.multiAnswerCount = Number(event.currentTarget.value);
					studio.persist();
				}}
			/>
			{#if !studio.multiAnswerIsAutomatic}
				<button type="button" class="reset" onclick={() => studio.resetMultiAnswerCount()}>
					Follow the question count
				</button>
			{/if}
		</label>
		<label>
			<span>Review questions</span>
			<input
				type="number"
				min="0"
				max="200"
				bind:value={studio.reviewQuestionCount}
				onchange={() => studio.persist()}
				disabled={weakTopics.length === 0}
			/>
		</label>
		<label>
			<span>Difficulty</span>
			<select bind:value={studio.difficulty} onchange={() => studio.persist()}>
				<option value="building">Building — slightly easier</option>
				<option value="exam">Exam level</option>
				<option value="brutal">Brutal — harder than the exam</option>
			</select>
		</label>
	</fieldset>

	<p class="budget">
		{studio.questionCount} questions × 120 seconds = <b>{minutes} minutes</b> when you sit it.
		{#if studio.multiAnswerIsAutomatic}
			Multi-answer follows the real exam's share, {studio.multiAnswerCount} of {studio.questionCount}.
		{/if}
	</p>

	{#if studio.warning}
		<div class="callout warn">{studio.warning}</div>
	{/if}

	<div class="output-header">
		<span class="label">3. Copy this prompt</span>
		<div class="actions">
			<button type="button" class="primary" onclick={copyPrompt}>Copy prompt</button>
			<button type="button" onclick={downloadPrompt}>Download .txt</button>
			{#if copied}<span class="copied" aria-live="polite">Copied ✓</span>{/if}
			{#if copyFailed}
				<span class="failed" aria-live="polite">
					Copying was blocked — the text is selected, press Ctrl+C
				</span>
			{/if}
		</div>
	</div>

	{#if !studio.hasTopics}
		<div class="callout warn">
			Add at least one topic above. Without them the prompt cannot be scoped, and the generator will
			test whatever it feels like.
		</div>
	{/if}

	<textarea id="prompt-output" class="prompt" rows="14" readonly value={prompt}></textarea>
</div>

<style>
	.field {
		display: block;
		margin-bottom: 16px;
	}

	.label {
		display: block;
		font-size: 13px;
		font-weight: bold;
		color: var(--navy);
		margin-bottom: 4px;
	}

	.hint {
		display: block;
		font-size: 12px;
		color: var(--muted);
		margin-bottom: 8px;
	}

	textarea {
		width: 100%;
		font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
		font-size: 12.5px;
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 10px;
		background: #fff;
		color: var(--text);
		resize: vertical;
		line-height: 1.5;
	}

	textarea.prompt {
		background: #0f1721;
		color: #cfe3ff;
		font-size: 12px;
		line-height: 1.45;
	}

	.parsed {
		font-size: 12.5px;
		color: var(--muted);
		margin: -6px 0 16px;
	}

	.parsed b {
		color: var(--navy);
	}

	.carry {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		flex-wrap: wrap;
	}

	.carry small {
		color: var(--muted);
	}

	.controls {
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #fafbfc;
		padding: 14px;
		margin: 0 0 14px;
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	}

	.controls legend {
		font-size: 13px;
		font-weight: bold;
		color: var(--navy);
		padding: 0 6px;
	}

	.controls label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.controls span {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--muted);
		font-weight: bold;
	}

	.controls input,
	.controls select {
		font-family: inherit;
		font-size: 13px;
		padding: 7px 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: #fff;
		color: var(--text);
	}

	.controls input:disabled {
		background: var(--bar);
		color: var(--muted);
	}

	.budget {
		font-size: 12.5px;
		color: var(--muted);
		margin: -4px 0 14px;
	}

	.controls em {
		font-style: normal;
		text-transform: none;
		letter-spacing: 0;
		color: var(--blue-dark);
		font-weight: normal;
	}

	.reset {
		align-self: flex-start;
		font-size: 11px !important;
		padding: 2px 8px !important;
		border-color: var(--line) !important;
		color: var(--muted) !important;
		font-weight: normal !important;
	}

	.output-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.copied {
		color: var(--ok);
		font-size: 12.5px;
		font-weight: bold;
	}

	.failed {
		color: var(--warn);
		font-size: 12.5px;
		font-weight: bold;
	}

	code {
		background: var(--bar);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 1px 6px;
		font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
		font-size: 12px;
	}
</style>
