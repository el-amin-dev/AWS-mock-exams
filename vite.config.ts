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
			exclude: ['src/lib/**/*.spec.ts', 'src/lib/**/index.ts'],
			// The domain layer is the engine's correctness, so it is held to a high bar
			// rather than a vanity percentage. Raise these as coverage improves; never
			// lower them to make a failing build pass.
			thresholds: {
				statements: 95,
				branches: 92,
				functions: 100,
				lines: 95
			}
		}
	}
});
