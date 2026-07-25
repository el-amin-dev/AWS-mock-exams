<script lang="ts">
	import { validateMock, type ValidationResult } from '$lib/domain/validation';
	import type { ExamMode, Mock } from '$lib/domain/types';
	import type { ExamSession } from '$lib/state/session.svelte';

	const { session }: { session: ExamSession } = $props();

	let pasted = $state('');
	let validation = $state<ValidationResult | null>(null);
	let parseError = $state('');
	let mode = $state<ExamMode>('exam');
	let dragging = $state(false);

	const readyMock = $derived<Mock | null>(validation?.valid ? validation.mock : null);

	/** Validates arbitrary text as mock JSON, keeping parse and schema errors distinct. */
	function inspect(text: string) {
		parseError = '';
		validation = null;
		if (!text.trim()) {
			parseError = 'There is nothing to load.';
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			parseError = `That is not valid JSON — ${error instanceof Error ? error.message : 'unparseable'}`;
			return;
		}
		validation = validateMock(parsed, session.config);
	}

	async function readFile(file: File | undefined) {
		if (!file) return;
		inspect(await file.text());
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		void readFile(event.dataTransfer?.files?.[0]);
	}

	function startSitting() {
		if (readyMock) session.load(readyMock, mode);
	}
</script>

<div class="exam-panel">
	<h1>Mock Exam Engine</h1>
	<p class="lead">
		Load a generated <code>mock.json</code> and sit it in one of two ways.
	</p>

	{#if session.resumable}
		<div class="callout warn resume">
			<div>
				<b>An unfinished attempt was found.</b>
				{session.resumable.mode === 'practice' ? 'Practice' : 'Exam'} ·
				{session.resumable.mock.questions.length} questions · saved
				{session.resumable.savedAt.slice(0, 16).replace('T', ' ')}
			</div>
			<div class="resume-actions">
				<button type="button" class="primary" onclick={() => session.resume()}>Resume</button>
				<button type="button" onclick={() => session.discardResumable()}>Discard</button>
			</div>
		</div>
	{/if}

	<fieldset class="modes">
		<legend>How do you want to sit it?</legend>
		<label class="mode" class:selected={mode === 'exam'}>
			<input type="radio" name="mode" value="exam" bind:group={mode} />
			<span>
				<b>Exam</b>
				<small>
					Blind until you submit, counting down, auto-submitted when time runs out. Use this to test
					yourself.
				</small>
			</span>
		</label>
		<label class="mode" class:selected={mode === 'practice'}>
			<input type="radio" name="mode" value="practice" bind:group={mode} />
			<span>
				<b>Practice</b>
				<small>
					Check each answer as you go and read the explanation immediately. The timer counts up and
					nothing is cut short. Use this to learn.
				</small>
			</span>
		</label>
	</fieldset>

	<div
		class="dropzone"
		class:dragging
		role="button"
		tabindex="0"
		ondragover={(event) => {
			event.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
		onclick={() => document.getElementById('mock-file')?.click()}
		onkeydown={(event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				document.getElementById('mock-file')?.click();
			}
		}}
	>
		<span class="icon" aria-hidden="true">📄</span>
		<span>Drop a <b>mock.json</b> here, or select a file</span>
		<input
			id="mock-file"
			type="file"
			accept=".json,application/json"
			hidden
			onchange={(event) => void readFile(event.currentTarget.files?.[0])}
		/>
	</div>

	<details>
		<summary>Or paste the JSON</summary>
		<textarea bind:value={pasted} rows="8" placeholder={'{ "title": "...", "questions": [ ... ] }'}
		></textarea>
		<button type="button" onclick={() => inspect(pasted)}>Validate</button>
	</details>

	{#if parseError}
		<div class="callout bad">{parseError}</div>
	{/if}

	{#if validation}
		{#if validation.valid}
			<div class="callout ok">
				✓ Valid — {validation.questionCount}
				{validation.questionCount === 1 ? 'question' : 'questions'} ready.
			</div>
		{:else}
			<div class="callout bad">
				✗ {validation.errors.length}
				{validation.errors.length === 1 ? 'problem' : 'problems'} — this cannot be sat until they are
				fixed.
			</div>
			<ul class="issues errors">
				{#each validation.errors as issue, index (index)}
					<li><b>{issue.path}</b> — {issue.message}</li>
				{/each}
			</ul>
		{/if}

		{#if validation.warnings.length > 0}
			<p class="warn-heading">
				Quality warnings — these do not block, but they usually mean a question is guessable:
			</p>
			<ul class="issues warnings">
				{#each validation.warnings as issue, index (index)}
					<li><b>{issue.path}</b> — {issue.message}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<div class="exam-footer">
	<div class="group"></div>
	<div class="group">
		<button type="button" class="primary" disabled={!readyMock} onclick={startSitting}>
			Continue ›
		</button>
	</div>
</div>

<style>
	.modes {
		border: 0;
		padding: 0;
		margin: 0 0 18px;
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	}

	.modes legend {
		font-size: 13px;
		font-weight: bold;
		color: var(--navy);
		margin-bottom: 8px;
	}

	.mode {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 12px 14px;
		cursor: pointer;
		background: #fff;
	}

	.mode:hover {
		border-color: #aebccb;
		background: #f5f8fb;
	}

	.mode.selected {
		border-color: var(--blue);
		background: #eaf2fb;
	}

	.mode input {
		margin-top: 3px;
		accent-color: var(--blue);
	}

	.mode b {
		display: block;
		font-size: 13.5px;
		color: var(--navy);
	}

	.mode small {
		display: block;
		font-size: 12px;
		color: var(--muted);
		margin-top: 3px;
	}

	.dropzone {
		border: 2px dashed var(--line);
		border-radius: 12px;
		padding: 28px 24px;
		text-align: center;
		background: #fafbfc;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		font-size: 13.5px;
	}

	.dropzone:hover,
	.dropzone.dragging {
		border-color: var(--blue);
		background: #eef5fc;
	}

	.dropzone .icon {
		font-size: 32px;
	}

	details {
		margin-top: 16px;
		font-size: 13px;
	}

	summary {
		cursor: pointer;
		color: var(--blue-dark);
		font-weight: bold;
	}

	textarea {
		width: 100%;
		margin: 10px 0;
		font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
		font-size: 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 10px;
	}

	.issues {
		font-size: 12.5px;
		margin: 0 0 10px 18px;
	}

	.issues li {
		margin: 3px 0;
	}

	.issues.errors li {
		color: var(--bad);
	}

	.issues.warnings li {
		color: var(--warn);
	}

	.warn-heading {
		font-size: 12px;
		color: var(--warn);
		font-weight: bold;
		margin-bottom: 4px;
	}

	.resume {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.resume-actions {
		display: flex;
		gap: 8px;
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
