<script lang="ts">
	import '$lib/styles/exam.css';

	const { children } = $props();
</script>

{@render children()}

<style>
	:global(html),
	:global(body) {
		height: 100%;
	}

	:global(body) {
		margin: 0;
		background: #7d8893;
		display: flex;
		justify-content: center;
		-webkit-font-smoothing: antialiased;
	}

	@media (prefers-color-scheme: dark) {
		:global(body) {
			background: #4a535c;
		}
	}
</style>
