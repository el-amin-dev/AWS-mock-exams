import { describe, expect, it, vi } from 'vitest';

import { createLogger, type LogSink } from './logger';

function makeSink(): LogSink & { calls: () => number } {
	const sink = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
	return {
		...sink,
		calls: () =>
			sink.debug.mock.calls.length +
			sink.info.mock.calls.length +
			sink.warn.mock.calls.length +
			sink.error.mock.calls.length
	};
}

describe('createLogger', () => {
	it('prefixes every line with its scope', () => {
		const sink = makeSink();
		createLogger('scoring', 'debug', sink).info('graded');
		expect(sink.info).toHaveBeenCalledWith('[scoring] graded');
	});

	it('passes structured details through untouched', () => {
		const sink = makeSink();
		const detail = { questions: 10 };
		createLogger('storage', 'debug', sink).warn('resuming', detail);
		expect(sink.warn).toHaveBeenCalledWith('[storage] resuming', detail);
	});

	it('suppresses anything below the configured level', () => {
		const sink = makeSink();
		const logger = createLogger('app', 'warn', sink);
		logger.debug('hidden');
		logger.info('hidden');
		expect(sink.calls()).toBe(0);
		logger.warn('shown');
		logger.error('shown');
		expect(sink.calls()).toBe(2);
	});

	it('emits nothing at all when silenced', () => {
		const sink = makeSink();
		const logger = createLogger('app', 'silent', sink);
		logger.debug('x');
		logger.info('x');
		logger.warn('x');
		logger.error('x');
		expect(sink.calls()).toBe(0);
	});

	it('emits everything at the most verbose level', () => {
		const sink = makeSink();
		const logger = createLogger('app', 'debug', sink);
		logger.debug('x');
		logger.info('x');
		logger.warn('x');
		logger.error('x');
		expect(sink.calls()).toBe(4);
	});

	it('routes each level to its matching sink method', () => {
		const sink = makeSink();
		createLogger('app', 'debug', sink).error('boom');
		expect(sink.error).toHaveBeenCalledOnce();
		expect(sink.warn).not.toHaveBeenCalled();
	});
});
