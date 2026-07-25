import { describe, expect, it } from 'vitest';

import {
	elapsedSeconds,
	formatDuration,
	hasExpired,
	pauseStopwatch,
	remainingSeconds,
	resumeStopwatch,
	startStopwatch,
	totalTimeSeconds
} from './timer';

const T0 = 1_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('stopwatch', () => {
	it('starts at zero', () => {
		expect(elapsedSeconds(startStopwatch(T0), T0)).toBe(0);
	});

	it('accrues while running', () => {
		expect(elapsedSeconds(startStopwatch(T0), T0 + 90 * SECOND)).toBe(90);
	});

	it('stops accruing once paused', () => {
		const paused = pauseStopwatch(startStopwatch(T0), T0 + 30 * SECOND);
		expect(elapsedSeconds(paused, T0 + 10 * MINUTE)).toBe(30);
	});

	it('resumes from where it left off', () => {
		const paused = pauseStopwatch(startStopwatch(T0), T0 + 30 * SECOND);
		const resumed = resumeStopwatch(paused, T0 + 10 * MINUTE);
		expect(elapsedSeconds(resumed, T0 + 10 * MINUTE + 5 * SECOND)).toBe(35);
	});

	it('ignores a redundant pause or resume', () => {
		const running = startStopwatch(T0);
		expect(resumeStopwatch(running, T0 + SECOND)).toBe(running);
		const paused = pauseStopwatch(running, T0 + SECOND);
		expect(pauseStopwatch(paused, T0 + 5 * SECOND)).toBe(paused);
	});

	it('never reports negative elapsed time if the clock jumps backwards', () => {
		expect(elapsedSeconds(startStopwatch(T0), T0 - 5 * SECOND)).toBe(0);
	});
});

describe('countdown', () => {
	const limit = 20 * 60;

	it('counts down from the full limit', () => {
		expect(remainingSeconds(startStopwatch(T0), T0, limit)).toBe(limit);
	});

	/**
	 * The regression this module exists for. A timer that decremented once per interval
	 * tick would lose only the ticks the browser chose to deliver while the tab was hidden;
	 * deriving from the wall clock charges the full wall-clock cost.
	 */
	it('charges the full wall-clock cost of a backgrounded tab', () => {
		const stopwatch = startStopwatch(T0);
		expect(remainingSeconds(stopwatch, T0 + 2 * MINUTE, limit)).toBe(limit - 120);
	});

	it('clamps at zero rather than going negative', () => {
		expect(remainingSeconds(startStopwatch(T0), T0 + 60 * MINUTE, limit)).toBe(0);
	});

	it('expires exactly at the limit, not before', () => {
		const stopwatch = startStopwatch(T0);
		expect(hasExpired(stopwatch, T0 + (limit - 1) * SECOND, limit)).toBe(false);
		expect(hasExpired(stopwatch, T0 + limit * SECOND, limit)).toBe(true);
	});
});

describe('totalTimeSeconds', () => {
	it('gives a full-length exam 130 minutes', () => {
		expect(totalTimeSeconds(65, 120)).toBe(7800);
	});

	it('scales with a shorter mock', () => {
		expect(totalTimeSeconds(10, 120)).toBe(1200);
	});

	it('never returns a negative budget', () => {
		expect(totalTimeSeconds(-5, 120)).toBe(0);
	});
});

describe('formatDuration', () => {
	it('formats under an hour as MM:SS', () => {
		expect(formatDuration(0)).toBe('00:00');
		expect(formatDuration(59)).toBe('00:59');
		expect(formatDuration(60)).toBe('01:00');
		expect(formatDuration(1200)).toBe('20:00');
	});

	/** A full-length exam runs to 130 minutes, which a minutes-only format cannot show. */
	it('switches to H:MM:SS at an hour so a full exam stays readable', () => {
		expect(formatDuration(3600)).toBe('1:00:00');
		expect(formatDuration(7800)).toBe('2:10:00');
		expect(formatDuration(3661)).toBe('1:01:01');
	});

	it('treats negative input as zero', () => {
		expect(formatDuration(-30)).toBe('00:00');
	});
});
