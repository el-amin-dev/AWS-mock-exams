import { describe, expect, it } from 'vitest';

import { APP_NAME, UNSCORED_RATIO } from '../src/lib/constants';

describe('scaffold smoke test', () => {
	it('exposes an application name', () => {
		expect(APP_NAME).toBeTruthy();
	});

	it('models the unscored share of a 65-question exam', () => {
		expect(UNSCORED_RATIO).toBeCloseTo(15 / 65);
		expect(Math.round(65 * UNSCORED_RATIO)).toBe(15);
	});
});
