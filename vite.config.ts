import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// The domain layer is deliberately DOM-free, so the default Node environment is
		// sufficient. Component tests arrive with the UI and will add their own project.
		include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/**/*.spec.ts']
		}
	}
});
