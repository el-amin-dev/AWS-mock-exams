import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The app is a fully static, client-rendered exam engine: there is no server, no
 * data loading, and no per-request work. `adapter-static` with an SPA fallback is
 * therefore the correct target, and `BASE_PATH` lets the same build be served from
 * a project subpath (GitHub Pages) or from a domain root.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// Every route is prerendered, so each one emits real HTML and no SPA fallback
		// is required; `strict` keeps that guarantee honest by failing the build if a
		// route ever becomes unreachable to the prerenderer.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			precompress: false,
			strict: true
		}),
		paths: {
			base: process.env.BASE_PATH ?? ''
		}
	}
};
