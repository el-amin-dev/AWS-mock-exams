<script lang="ts">
	import { APP_NAME } from '$lib/constants';
</script>

<svelte:head>
	<title>{APP_NAME}</title>
	<meta
		name="description"
		content="Course-agnostic mock exam engine with exam and practice modes."
	/>
</svelte:head>

<main>
	<h1>{APP_NAME}</h1>
	<p>Toolchain scaffold. The exam engine lands in the following changes.</p>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 2rem 1rem;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
	}
</style>
