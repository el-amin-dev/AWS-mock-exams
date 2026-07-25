/**
 * Time keeping.
 *
 * Every function here derives time from wall-clock timestamps rather than from a count of
 * interval ticks. This matters: browsers throttle `setInterval` in backgrounded tabs, so a
 * timer that decrements per tick silently grants extra minutes to anyone who switches away
 * from the exam. A ticking interval may still drive *repainting*, but it must never be the
 * source of truth for how much time has passed.
 *
 * All functions take `now` as an argument so they stay pure and directly testable.
 */

/** A stopwatch that survives being paused and resumed. */
export interface Stopwatch {
	/** Milliseconds accumulated during previous running spells. */
	readonly accumulatedMs: number;
	/** When the current spell began, or `null` while paused. */
	readonly runningSinceMs: number | null;
}

/** Creates a stopwatch that is already running. */
export function startStopwatch(nowMs: number): Stopwatch {
	return { accumulatedMs: 0, runningSinceMs: nowMs };
}

/** Suspends a stopwatch, banking the current spell. Pausing twice is a no-op. */
export function pauseStopwatch(stopwatch: Stopwatch, nowMs: number): Stopwatch {
	if (stopwatch.runningSinceMs === null) return stopwatch;
	return {
		accumulatedMs: stopwatch.accumulatedMs + (nowMs - stopwatch.runningSinceMs),
		runningSinceMs: null
	};
}

/** Restarts a paused stopwatch. Resuming a running one is a no-op. */
export function resumeStopwatch(stopwatch: Stopwatch, nowMs: number): Stopwatch {
	if (stopwatch.runningSinceMs !== null) return stopwatch;
	return { accumulatedMs: stopwatch.accumulatedMs, runningSinceMs: nowMs };
}

/** Total elapsed milliseconds, whether the stopwatch is running or paused. */
export function elapsedMs(stopwatch: Stopwatch, nowMs: number): number {
	const current = stopwatch.runningSinceMs === null ? 0 : nowMs - stopwatch.runningSinceMs;
	return Math.max(0, stopwatch.accumulatedMs + current);
}

/** Total elapsed whole seconds. Drives the count-up display in practice mode. */
export function elapsedSeconds(stopwatch: Stopwatch, nowMs: number): number {
	return Math.floor(elapsedMs(stopwatch, nowMs) / 1000);
}

/** Seconds left against a limit, never below zero. Drives the exam-mode countdown. */
export function remainingSeconds(
	stopwatch: Stopwatch,
	nowMs: number,
	limitSeconds: number
): number {
	return Math.max(0, limitSeconds - elapsedSeconds(stopwatch, nowMs));
}

/** Whether the time limit has been reached, which forces submission in exam mode. */
export function hasExpired(stopwatch: Stopwatch, nowMs: number, limitSeconds: number): boolean {
	return remainingSeconds(stopwatch, nowMs, limitSeconds) <= 0;
}

/** The total time budget for a mock of `questionCount` questions. */
export function totalTimeSeconds(questionCount: number, secondsPerQuestion: number): number {
	return Math.max(0, questionCount * secondsPerQuestion);
}

/**
 * Formats a duration for display.
 *
 * Shows `H:MM:SS` once an hour is reached and `MM:SS` below it. A full-length exam runs to
 * 130 minutes, which a minutes-only format would render as the unreadable `130:00`.
 */
export function formatDuration(totalSeconds: number): string {
	const safe = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const seconds = safe % 60;
	const paddedSeconds = String(seconds).padStart(2, '0');
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
	return `${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}
