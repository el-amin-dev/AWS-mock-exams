/**
 * The clock, as a seam.
 *
 * Reading the time is the one unavoidable side effect in an exam engine. Isolating it here
 * means the reactive session can stay free of `new Date()` — which linting rightly flags in
 * reactive code, since a mutable `Date` held in state would not track — and gives tests a
 * single place to substitute a fixed clock.
 */

/** Milliseconds since the epoch. */
export function nowMs(): number {
	return Date.now();
}

/** The current instant as an ISO-8601 string, for timestamps that are stored or displayed. */
export function nowIso(): string {
	return new Date(nowMs()).toISOString();
}
