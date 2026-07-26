<script lang="ts">
	import { shuffledTips, type TipCategory } from '$lib/domain/tip-library';

	interface Props {
		/** Attempt seed, so the order of advice is reproducible within one sitting. */
		seed?: number;
		/** Restricts the rotation to a single family of advice. */
		category?: TipCategory;
		/** How long each tip holds the banner, in milliseconds. */
		intervalMs?: number;
	}

	const { seed = 0, category, intervalMs = 8000 }: Props = $props();

	const tips = $derived(shuffledTips(seed, category));

	let position = $state(0);
	/** Explicitly paused by the control, as opposed to merely held by a pointer. */
	let paused = $state(false);
	let hovered = $state(false);
	let focused = $state(false);

	const current = $derived(tips[position % tips.length]);
	const held = $derived(paused || hovered || focused);

	function step(delta: number) {
		position = (position + delta + tips.length) % tips.length;
	}

	/*
	 * Rotation.
	 *
	 * Reading `position` here is deliberate: it restarts the countdown after a manual move,
	 * so pressing Next never leaves a tip on screen for a fraction of a second. The returned
	 * cleanup runs before every re-run and on destroy, so no timer outlives the component.
	 */
	$effect(() => {
		void position;
		if (held || tips.length < 2) return;
		const timer = setInterval(() => step(1), intervalMs);
		return () => clearInterval(timer);
	});
</script>

<section
	class="tip-ticker"
	aria-label="Exam tips"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
	onfocusin={() => (focused = true)}
	onfocusout={() => (focused = false)}
>
	<div class="stage" aria-live="polite" aria-atomic="true">
		{#key position}
			{#if current}
				<p class="tip">
					<span class="badge">{current.category}</span>
					<span class="text"><b>{current.label}.</b> {current.body}</span>
				</p>
			{/if}
		{/key}
	</div>

	<div class="controls">
		<button type="button" class="ticker-button" onclick={() => step(-1)}>
			<span aria-hidden="true">‹</span>
			<span class="visually-hidden">Previous tip</span>
		</button>
		<button
			type="button"
			class="ticker-button pause"
			aria-pressed={paused}
			onclick={() => (paused = !paused)}
		>
			<span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
			<span class="visually-hidden">
				{paused ? 'Resume rotating tips' : 'Pause rotating tips'}
			</span>
		</button>
		<button type="button" class="ticker-button" onclick={() => step(1)}>
			<span aria-hidden="true">›</span>
			<span class="visually-hidden">Next tip</span>
		</button>
	</div>
</section>

<style>
	.tip-ticker {
		display: flex;
		align-items: center;
		gap: 12px;
		border: 1px solid var(--line);
		border-left: 4px solid var(--blue);
		border-radius: 5px;
		background: var(--bar);
		padding: 8px 10px 8px 12px;
		overflow: hidden;
	}

	/* Fixed height so the surrounding layout never shifts as tips of different lengths
	   slide through, and so the animation has somewhere to slide from. */
	.stage {
		flex: 1;
		min-width: 0;
		min-height: 42px;
		display: flex;
		align-items: center;
		overflow: hidden;
	}

	.tip {
		display: flex;
		align-items: baseline;
		gap: 9px;
		font-size: 12.5px;
		line-height: 1.45;
		margin: 0;
		animation: tip-enter 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
	}

	@keyframes tip-enter {
		from {
			opacity: 0;
			transform: translateY(90%);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.badge {
		flex: none;
		font-size: 9.5px;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: #fff;
		background: var(--blue);
		border-radius: 3px;
		padding: 2px 6px;
	}

	.text {
		color: var(--muted);
	}

	.text b {
		color: var(--navy);
	}

	.controls {
		flex: none;
		display: flex;
		gap: 4px;
	}

	.ticker-button {
		font-size: 11px !important;
		line-height: 1;
		padding: 5px 8px !important;
		min-width: 26px;
		border-color: var(--line) !important;
		color: var(--muted) !important;
		background: #fff;
	}

	.ticker-button.pause[aria-pressed='true'] {
		color: var(--navy) !important;
		border-color: var(--navy) !important;
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

	/* Rotation continues; only the movement stops. Someone who cannot tolerate motion still
	   gets the advice, it simply appears rather than slides. */
	@media (prefers-reduced-motion: reduce) {
		.tip {
			animation: none;
		}
	}
</style>
