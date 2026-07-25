/**
 * Levelled logging.
 *
 * `rules.md` forbids bare `console` calls for runtime information. In a browser app the
 * console is still the only sink available, so this wraps it to give levels, a consistent
 * prefix, and a single place to raise or lower verbosity — or to route elsewhere later
 * without touching call sites.
 */

/** Severity levels, ordered from most to least verbose. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
	silent: 100
};

/** Emits messages at or above the configured level. */
export interface Logger {
	debug(message: string, ...details: unknown[]): void;
	info(message: string, ...details: unknown[]): void;
	warn(message: string, ...details: unknown[]): void;
	error(message: string, ...details: unknown[]): void;
}

/** Where log lines are written. Swapped for a spy in tests. */
export interface LogSink {
	debug(...args: unknown[]): void;
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

/** Verbose while developing, quiet in a production build. */
export const DEFAULT_LOG_LEVEL: LogLevel = import.meta.env?.DEV ? 'debug' : 'warn';

/**
 * Creates a logger for one area of the application.
 *
 * @param scope Short name shown in every line, such as `scoring` or `storage`.
 * @param level Minimum level to emit.
 * @param sink Destination; defaults to the browser console.
 */
export function createLogger(
	scope: string,
	level: LogLevel = DEFAULT_LOG_LEVEL,
	sink: LogSink = console
): Logger {
	const threshold = LEVEL_RANK[level];
	const emit =
		(method: keyof LogSink, methodLevel: LogLevel) =>
		(message: string, ...details: unknown[]): void => {
			if (LEVEL_RANK[methodLevel] < threshold) return;
			sink[method](`[${scope}] ${message}`, ...details);
		};

	return {
		debug: emit('debug', 'debug'),
		info: emit('info', 'info'),
		warn: emit('warn', 'warn'),
		error: emit('error', 'error')
	};
}
