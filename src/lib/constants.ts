/**
 * Application-wide constants.
 *
 * `rules.md` forbids magic numbers at call sites: every tunable the engine depends on is
 * named here or in a course profile's `ExamConfig`, never inlined.
 */

/** Display name of the application. */
export const APP_NAME = 'Mock Exam Engine';

/**
 * Fraction of a certification exam's questions that are unscored trial items.
 * Modelled on a 65-question exam of which 15 do not count toward the result.
 */
export const UNSCORED_RATIO = 15 / 65;
