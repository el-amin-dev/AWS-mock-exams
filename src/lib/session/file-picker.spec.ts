import { describe, expect, it, vi } from 'vitest';

import {
	createHandleStore,
	defaultIdbFactory,
	defaultPickerBackend,
	FALLBACK_DIRECTORY,
	grantMocksDirectory,
	HANDLE_STORE_NAME,
	isAbortError,
	isFilePickerSupported,
	MOCKS_HANDLE_KEY,
	pickMockFile,
	resolveStartIn,
	verifyPermission,
	type DirectoryEntry,
	type DirectoryHandle,
	type HandlePermission,
	type HandleStore,
	type IdbDatabaseLike,
	type IdbFactoryLike,
	type IdbObjectStoreLike,
	type IdbOpenRequestLike,
	type IdbRequestLike,
	type PickerBackend,
	type PickerScope
} from './file-picker';

/** The rejection a browser produces when the chooser is closed without choosing. */
function abort(): Error {
	const error = new Error('The user aborted a request.');
	error.name = 'AbortError';
	return error;
}

/** A directory handle listing `names`, with the permission answers a test wants. */
function makeHandle(
	names: readonly string[],
	permissions: {
		query?: HandlePermission | (() => never);
		request?: HandlePermission;
		omitPermissionApi?: boolean;
		listThrows?: boolean;
	} = {}
): DirectoryHandle {
	const handle: DirectoryHandle = {
		name: 'mocks',
		values: async function* (): AsyncGenerator<DirectoryEntry> {
			if (permissions.listThrows) throw new Error('NotFoundError');
			for (const name of names) {
				yield { kind: name.endsWith('/') ? 'directory' : 'file', name: name.replace('/', '') };
			}
		}
	};
	if (permissions.omitPermissionApi) return handle;
	return {
		...handle,
		queryPermission: async () => {
			const answer = permissions.query ?? 'granted';
			if (typeof answer === 'function') return answer();
			return answer;
		},
		requestPermission: async () => permissions.request ?? 'denied'
	};
}

/** An in-memory handle store, recording whether it was cleared. */
function makeStore(initial: DirectoryHandle | null = null) {
	let held = initial;
	return {
		cleared: false,
		get: async () => held,
		set: async (handle: DirectoryHandle) => {
			held = handle;
		},
		clear: async function (this: { cleared: boolean }) {
			this.cleared = true;
			held = null;
		},
		get held() {
			return held;
		}
	};
}

describe('start directory decision', () => {
	it('falls back to downloads when nothing has been granted', async () => {
		expect(await resolveStartIn(makeStore())).toBe(FALLBACK_DIRECTORY);
	});

	it('falls back to downloads when there is no store at all', async () => {
		expect(await resolveStartIn(null)).toBe(FALLBACK_DIRECTORY);
	});

	it('opens in the granted mocks folder when it holds a mock', async () => {
		const handle = makeHandle(['sample.json', 'notes.txt']);
		expect(await resolveStartIn(makeStore(handle))).toBe(handle);
	});

	it('accepts an upper-case extension', async () => {
		const handle = makeHandle(['SAMPLE.JSON']);
		expect(await resolveStartIn(makeStore(handle))).toBe(handle);
	});

	it('falls back to downloads when the granted folder holds no json', async () => {
		const store = makeStore(makeHandle(['readme.md', 'archive/']));
		expect(await resolveStartIn(store)).toBe(FALLBACK_DIRECTORY);
		// Still a usable folder, so it is kept for next time.
		expect(store.cleared).toBe(false);
	});

	it('ignores a subdirectory that merely ends in .json', async () => {
		const store = makeStore(makeHandle(['bundle.json/']));
		expect(await resolveStartIn(store)).toBe(FALLBACK_DIRECTORY);
	});

	it('discards the handle and falls back when permission is refused', async () => {
		const store = makeStore(makeHandle(['sample.json'], { query: 'prompt', request: 'denied' }));
		expect(await resolveStartIn(store)).toBe(FALLBACK_DIRECTORY);
		expect(store.cleared).toBe(true);
		expect(store.held).toBeNull();
	});

	it('re-prompts and proceeds when the lapsed grant is renewed', async () => {
		const handle = makeHandle(['sample.json'], { query: 'prompt', request: 'granted' });
		expect(await resolveStartIn(makeStore(handle))).toBe(handle);
	});

	it('discards a stale handle whose folder no longer lists', async () => {
		const store = makeStore(makeHandle([], { listThrows: true }));
		expect(await resolveStartIn(store)).toBe(FALLBACK_DIRECTORY);
		expect(store.cleared).toBe(true);
	});

	it('falls back when the store itself cannot be read', async () => {
		const hostile: HandleStore = {
			get: () => Promise.reject(new Error('blocked')),
			set: vi.fn(),
			clear: vi.fn()
		};
		expect(await resolveStartIn(hostile)).toBe(FALLBACK_DIRECTORY);
	});

	it('still falls back when discarding the handle also fails', async () => {
		const hostile: HandleStore = {
			get: async () => makeHandle(['sample.json'], { query: 'denied' }),
			set: vi.fn(),
			clear: () => Promise.reject(new Error('blocked'))
		};
		expect(await resolveStartIn(hostile)).toBe(FALLBACK_DIRECTORY);
	});
});

describe('permission verification', () => {
	it('trusts a handle that cannot report permissions', async () => {
		expect(await verifyPermission(makeHandle([], { omitPermissionApi: true }))).toBe(true);
	});

	it('refuses when only a query is available and it is not granted', async () => {
		const handle = makeHandle([], { query: 'prompt' });
		const withoutRequest: DirectoryHandle = {
			name: handle.name,
			values: handle.values.bind(handle),
			queryPermission: async () => 'prompt'
		};
		expect(await verifyPermission(withoutRequest)).toBe(false);
	});

	it('treats a throwing query as denied', async () => {
		const handle = makeHandle([], {
			query: () => {
				throw new Error('gone');
			}
		});
		expect(await verifyPermission(handle)).toBe(false);
	});
});

describe('choosing a file', () => {
	function backendReturning(file: File | null): PickerBackend {
		return {
			openFile: async () => (file ? [{ getFile: async () => file }] : []),
			openDirectory: async () => makeHandle([])
		};
	}

	it('returns the chosen file and opens where the decision said', async () => {
		const file = new File(['{}'], 'mock.json');
		const openFile = vi.fn(async () => [{ getFile: async () => file }]);
		const handle = makeHandle(['sample.json']);
		const chosen = await pickMockFile({
			backend: { openFile, openDirectory: async () => handle },
			store: makeStore(handle)
		});
		expect(chosen).toBe(file);
		expect(openFile).toHaveBeenCalledWith({ startIn: handle });
	});

	it('opens in downloads when no folder has been granted', async () => {
		const openFile = vi.fn(async () => []);
		await pickMockFile({ backend: { openFile, openDirectory: async () => makeHandle([]) } });
		expect(openFile).toHaveBeenCalledWith({ startIn: FALLBACK_DIRECTORY });
	});

	it('returns null when the chooser hands back nothing', async () => {
		expect(await pickMockFile({ backend: backendReturning(null), store: null })).toBeNull();
	});

	it('treats cancellation as no choice rather than an error', async () => {
		const backend: PickerBackend = {
			openFile: () => Promise.reject(abort()),
			openDirectory: async () => makeHandle([])
		};
		await expect(pickMockFile({ backend })).resolves.toBeNull();
	});

	it('rethrows a real failure so the caller can fall back', async () => {
		const backend: PickerBackend = {
			openFile: () => Promise.reject(new Error('SecurityError')),
			openDirectory: async () => makeHandle([])
		};
		await expect(pickMockFile({ backend })).rejects.toThrow('SecurityError');
	});
});

describe('granting the mocks folder', () => {
	it('remembers the folder the candidate picked', async () => {
		const handle = makeHandle(['sample.json']);
		const store = makeStore();
		const backend: PickerBackend = {
			openFile: async () => [],
			openDirectory: async () => handle
		};
		expect(await grantMocksDirectory({ backend, store })).toBe(handle);
		expect(store.held).toBe(handle);
	});

	it('works without a store to remember it in', async () => {
		const handle = makeHandle([]);
		const backend: PickerBackend = { openFile: async () => [], openDirectory: async () => handle };
		expect(await grantMocksDirectory({ backend })).toBe(handle);
	});

	it('treats a declined prompt as no folder rather than an error', async () => {
		const backend: PickerBackend = {
			openFile: async () => [],
			openDirectory: () => Promise.reject(abort())
		};
		await expect(grantMocksDirectory({ backend })).resolves.toBeNull();
	});

	it('rethrows a real failure', async () => {
		const backend: PickerBackend = {
			openFile: async () => [],
			openDirectory: () => Promise.reject(new Error('SecurityError'))
		};
		await expect(grantMocksDirectory({ backend })).rejects.toThrow('SecurityError');
	});
});

describe('abort detection', () => {
	it.each([
		['a DOMException-shaped abort', abort(), true],
		['a bare object carrying the name', { name: 'AbortError' }, true],
		['an unrelated error', new Error('boom'), false],
		['null', null, false],
		['a string', 'AbortError', false]
	])('recognises %s', (_label, value, expected) => {
		expect(isAbortError(value)).toBe(expected);
	});
});

describe('capability detection', () => {
	const scope = (extra: Partial<PickerScope>): PickerScope => ({
		showOpenFilePicker: async () => [],
		showDirectoryPicker: async () => makeHandle([]),
		isSecureContext: true,
		...extra
	});

	it('reports unsupported when the API is missing, without throwing', () => {
		expect(isFilePickerSupported({})).toBe(false);
		expect(defaultPickerBackend({})).toBeNull();
	});

	it('reports unsupported outside a secure context', () => {
		expect(isFilePickerSupported(scope({ isSecureContext: false }))).toBe(false);
	});

	it('reports supported when both conditions hold', () => {
		expect(isFilePickerSupported(scope({}))).toBe(true);
	});

	it('reads the ambient globals when no scope is given', () => {
		// Node has no file picker, so this exercises the default argument.
		expect(isFilePickerSupported()).toBe(false);
	});

	it('forwards the picker call with a json filter and a single selection', async () => {
		const showOpenFilePicker = vi.fn(async () => []);
		const backend = defaultPickerBackend(scope({ showOpenFilePicker }));
		await backend?.openFile({ startIn: 'downloads' });
		expect(showOpenFilePicker).toHaveBeenCalledWith({
			startIn: 'downloads',
			multiple: false,
			types: [{ description: 'Mock exam', accept: { 'application/json': ['.json'] } }]
		});
	});

	it('forwards the directory call in read mode', async () => {
		const handle = makeHandle([]);
		const showDirectoryPicker = vi.fn(async () => handle);
		const backend = defaultPickerBackend(scope({ showDirectoryPicker }));
		await expect(backend?.openDirectory()).resolves.toBe(handle);
		expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: 'read' });
	});

	it('rejects a directory grant where only the file picker exists', async () => {
		const partial: PickerScope = { showOpenFilePicker: async () => [], isSecureContext: true };
		await expect(defaultPickerBackend(partial)?.openDirectory()).rejects.toThrow(
			'cannot grant access to a directory'
		);
	});
});

/* -------------------------------------------------------------------------- */
/* A fake IndexedDB, small enough to be obvious and complete enough to prove   */
/* the store round-trips a handle through it.                                  */
/* -------------------------------------------------------------------------- */

type Failure = 'open' | 'get' | 'put' | 'delete' | null;

function makeIdb(options: { failOn?: Failure; preexistingStore?: boolean } = {}): IdbFactoryLike & {
	data: Map<string, unknown>;
	closed: number;
} {
	const data = new Map<string, unknown>();
	const stores = new Set<string>(options.preexistingStore ? [HANDLE_STORE_NAME] : []);
	const factory = {
		data,
		closed: 0,
		open(): IdbOpenRequestLike {
			const request: IdbOpenRequestLike = {
				result: undefined as unknown as IdbDatabaseLike,
				error: options.failOn === 'open' ? new Error('open blocked') : null,
				onsuccess: null,
				onerror: null,
				onupgradeneeded: null
			};
			(request as { result: IdbDatabaseLike }).result = database;
			queueMicrotask(() => {
				if (options.failOn === 'open') {
					request.onerror?.();
					return;
				}
				request.onupgradeneeded?.();
				request.onsuccess?.();
			});
			return request;
		}
	};

	function makeRequest<T>(result: T, failing: boolean): IdbRequestLike<T> {
		const request: IdbRequestLike<T> = {
			result,
			error: failing ? new Error('request blocked') : null,
			onsuccess: null,
			onerror: null
		};
		queueMicrotask(() => (failing ? request.onerror?.() : request.onsuccess?.()));
		return request;
	}

	const objectStore: IdbObjectStoreLike = {
		get: (key) => makeRequest(data.get(key), options.failOn === 'get'),
		put: (value, key) => {
			if (options.failOn !== 'put') data.set(key, value);
			return makeRequest(undefined, options.failOn === 'put');
		},
		delete: (key) => {
			if (options.failOn !== 'delete') data.delete(key);
			return makeRequest(undefined, options.failOn === 'delete');
		}
	};

	const database: IdbDatabaseLike = {
		objectStoreNames: { contains: (name) => stores.has(name) },
		createObjectStore: (name) => stores.add(name),
		transaction: () => ({ objectStore: () => objectStore }),
		close: () => {
			factory.closed += 1;
		}
	};

	return factory;
}

describe('handle persistence', () => {
	it('round-trips a handle and forgets it on request', async () => {
		const idb = makeIdb();
		const store = createHandleStore(idb);
		expect(store).not.toBeNull();
		if (!store) return;

		expect(await store.get()).toBeNull();
		const handle = makeHandle(['sample.json']);
		await store.set(handle);
		expect(idb.data.get(MOCKS_HANDLE_KEY)).toBe(handle);
		expect(await store.get()).toBe(handle);

		await store.clear();
		expect(await store.get()).toBeNull();
		expect(idb.closed).toBeGreaterThan(0);
	});

	it('leaves an existing object store alone on upgrade', async () => {
		const store = createHandleStore(makeIdb({ preexistingStore: true }));
		await expect(store?.get()).resolves.toBeNull();
	});

	it('has no store at all when there is no IndexedDB', () => {
		expect(createHandleStore(null)).toBeNull();
	});

	it.each([['open'], ['get']] as const)('survives a database that fails to %s', async (failOn) => {
		const store = createHandleStore(makeIdb({ failOn }));
		await expect(store?.get()).resolves.toBeNull();
	});

	it.each([['put'], ['delete']] as const)('never throws when it cannot %s', async (failOn) => {
		const store = createHandleStore(makeIdb({ failOn }));
		await expect(store?.set(makeHandle([]))).resolves.toBeUndefined();
		await expect(store?.clear()).resolves.toBeUndefined();
	});

	it('returns null where IndexedDB is absent', () => {
		expect(defaultIdbFactory({})).toBeNull();
	});

	it('returns the factory where IndexedDB exists', () => {
		const idb = makeIdb();
		expect(defaultIdbFactory({ indexedDB: idb })).toBe(idb);
	});

	it('survives a scope whose indexedDB property throws', () => {
		const hostile = {} as PickerScope;
		Object.defineProperty(hostile, 'indexedDB', {
			get() {
				throw new Error('blocked by policy');
			}
		});
		expect(defaultIdbFactory(hostile)).toBeNull();
	});

	it('reads the ambient globals when no scope is given', () => {
		expect(() => defaultIdbFactory()).not.toThrow();
	});
});
