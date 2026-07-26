import { createLogger } from '../logger';

/**
 * Where the mock file chooser opens.
 *
 * A candidate keeps mocks in two places: the sample mocks that ship with the project, and the
 * freshly generated one that just landed in Downloads. A browser cannot be handed a filesystem
 * path — that is a sandbox boundary, not an oversight — so the only lever available is the File
 * System Access API's `startIn`, which accepts either a well-known directory name or a directory
 * handle the user granted earlier.
 *
 * The mocks directory therefore has to be granted once, and the handle kept. Handles are
 * structured-cloneable but not stringifiable, so IndexedDB is the only store that can hold one.
 *
 * Both seams — IndexedDB access and the picker itself — are injected, so the decision logic is
 * testable without a browser, matching the `StorageBackend` seam in `storage.ts`. The whole
 * module degrades to `null` on browsers without the API (everything but Chromium), leaving the
 * caller to fall back to a plain `<input type="file">`.
 */

const logger = createLogger('file-picker');

/** The IndexedDB database, store and key this module owns. */
export const HANDLE_DB_NAME = 'mock-exam-engine';
export const HANDLE_DB_VERSION = 1;
export const HANDLE_STORE_NAME = 'directory-handles';
export const MOCKS_HANDLE_KEY = 'mocks-directory';

/** Well-known directories `startIn` accepts by name. */
export type WellKnownDirectory =
	| 'desktop'
	| 'documents'
	| 'downloads'
	| 'music'
	| 'pictures'
	| 'videos';

/**
 * Used whenever the mocks directory cannot be offered: a mock that was just generated arrives
 * in Downloads, so it is the only sensible second guess.
 */
export const FALLBACK_DIRECTORY: WellKnownDirectory = 'downloads';

/** What the picker may be told to open in. */
export type StartIn = WellKnownDirectory | DirectoryHandle;

/** Permission states a directory handle can report. */
export type HandlePermission = 'granted' | 'denied' | 'prompt';

/** One entry inside a directory. */
export interface DirectoryEntry {
	readonly kind: string;
	readonly name: string;
}

/**
 * The slice of `FileSystemDirectoryHandle` used here.
 *
 * `queryPermission` and `requestPermission` are optional because they are a separate proposal
 * and may be absent even where the picker exists.
 */
export interface DirectoryHandle {
	readonly name: string;
	values(): AsyncIterable<DirectoryEntry>;
	queryPermission?(descriptor: { mode: 'read' }): Promise<HandlePermission>;
	requestPermission?(descriptor: { mode: 'read' }): Promise<HandlePermission>;
}

/** The slice of `FileSystemFileHandle` used here. */
export interface FileHandleLike {
	getFile(): Promise<File>;
}

/** Options passed to the file picker. */
export interface OpenFilePickerOptions {
	readonly startIn: StartIn;
	readonly multiple?: boolean;
	readonly types?: readonly {
		readonly description: string;
		readonly accept: Record<string, readonly string[]>;
	}[];
}

/** Injection seam: the two File System Access API entry points this module needs. */
export interface PickerBackend {
	openFile(options: OpenFilePickerOptions): Promise<readonly FileHandleLike[]>;
	openDirectory(): Promise<DirectoryHandle>;
}

/** Injection seam: persistence for the granted mocks directory handle. */
export interface HandleStore {
	get(): Promise<DirectoryHandle | null>;
	set(handle: DirectoryHandle): Promise<void>;
	clear(): Promise<void>;
}

/** The slice of an IndexedDB request this module reads. */
export interface IdbRequestLike<T> {
	readonly result: T;
	readonly error: unknown;
	onsuccess: (() => void) | null;
	onerror: (() => void) | null;
}

/** The slice of an IndexedDB open request, which also reports schema upgrades. */
export interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
	onupgradeneeded: (() => void) | null;
}

export interface IdbObjectStoreLike {
	get(key: string): IdbRequestLike<unknown>;
	put(value: unknown, key: string): IdbRequestLike<unknown>;
	delete(key: string): IdbRequestLike<unknown>;
}

export interface IdbTransactionLike {
	objectStore(name: string): IdbObjectStoreLike;
}

export interface IdbDatabaseLike {
	readonly objectStoreNames: { contains(name: string): boolean };
	createObjectStore(name: string): unknown;
	transaction(name: string, mode: 'readonly' | 'readwrite'): IdbTransactionLike;
	close(): void;
}

/** Injection seam: IndexedDB itself. */
export interface IdbFactoryLike {
	open(name: string, version: number): IdbOpenRequestLike;
}

/** The globals this module reads, so tests can hand it a fake instead of a browser. */
export interface PickerScope {
	showOpenFilePicker?: (options: OpenFilePickerOptions) => Promise<readonly FileHandleLike[]>;
	showDirectoryPicker?: (options: { mode: 'read' }) => Promise<DirectoryHandle>;
	isSecureContext?: boolean;
	indexedDB?: IdbFactoryLike;
}

/** The ambient globals, in the shape this module reads them. */
function globalScope(): PickerScope {
	return globalThis as unknown as PickerScope;
}

/**
 * Builds a backend from the real API, or returns `null` where it is unusable.
 *
 * `showOpenFilePicker` is Chromium-only and refuses to run outside a secure context, so both
 * are checked rather than assumed.
 */
export function defaultPickerBackend(scope: PickerScope = globalScope()): PickerBackend | null {
	const openFilePicker = scope.showOpenFilePicker;
	if (typeof openFilePicker !== 'function' || scope.isSecureContext !== true) return null;
	const openDirectoryPicker = scope.showDirectoryPicker;

	return {
		openFile: (options) =>
			openFilePicker.call(scope, {
				...options,
				multiple: false,
				types: [{ description: 'Mock exam', accept: { 'application/json': ['.json'] } }]
			}),
		openDirectory: () =>
			typeof openDirectoryPicker === 'function'
				? openDirectoryPicker.call(scope, { mode: 'read' })
				: Promise.reject(new Error('This browser cannot grant access to a directory.'))
	};
}

/** Whether the File System Access picker can be used at all. */
export function isFilePickerSupported(scope: PickerScope = globalScope()): boolean {
	return defaultPickerBackend(scope) !== null;
}

/**
 * Returns IndexedDB, or `null` where it is unavailable.
 *
 * Reading the property throws outright in some sandboxed and private-browsing contexts, so this
 * probes rather than assuming.
 */
export function defaultIdbFactory(scope: PickerScope = globalScope()): IdbFactoryLike | null {
	try {
		return scope.indexedDB ?? null;
	} catch (error) {
		logger.warn('IndexedDB is unavailable; the mocks folder will not be remembered.', error);
		return null;
	}
}

/** Opens the handle database, creating the object store on first use. */
function openDatabase(factory: IdbFactoryLike): Promise<IdbDatabaseLike> {
	return new Promise<IdbDatabaseLike>((resolve, reject) => {
		const request = factory.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(HANDLE_STORE_NAME)) {
				database.createObjectStore(HANDLE_STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(asError(request.error, 'The handle database could not be opened.'));
	});
}

/** Bridges an IndexedDB request's callback pair to a promise. */
function promisifyRequest<T>(request: IdbRequestLike<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(asError(request.error, 'The handle database request failed.'));
	});
}

/** Keeps rejections to `Error`, whatever IndexedDB reported. */
function asError(cause: unknown, message: string): Error {
	return cause instanceof Error ? cause : new Error(message);
}

/**
 * An IndexedDB-backed handle store, or `null` when there is no IndexedDB.
 *
 * Every failure is swallowed and logged: forgetting the mocks folder costs one extra click,
 * which must never be an error the candidate has to deal with mid-session.
 */
export function createHandleStore(factory: IdbFactoryLike | null): HandleStore | null {
	if (!factory) return null;
	const idb = factory;

	async function withStore<T>(
		mode: 'readonly' | 'readwrite',
		run: (store: IdbObjectStoreLike) => IdbRequestLike<T>
	): Promise<T> {
		const database = await openDatabase(idb);
		try {
			const store = database.transaction(HANDLE_STORE_NAME, mode).objectStore(HANDLE_STORE_NAME);
			return await promisifyRequest(run(store));
		} finally {
			database.close();
		}
	}

	return {
		get: async () => {
			try {
				const stored = await withStore('readonly', (store) => store.get(MOCKS_HANDLE_KEY));
				return (stored as DirectoryHandle | undefined) ?? null;
			} catch (error) {
				logger.warn('Could not read the saved mocks folder.', error);
				return null;
			}
		},
		set: async (handle) => {
			try {
				await withStore('readwrite', (store) => store.put(handle, MOCKS_HANDLE_KEY));
			} catch (error) {
				logger.warn('Could not remember the mocks folder.', error);
			}
		},
		clear: async () => {
			try {
				await withStore('readwrite', (store) => store.delete(MOCKS_HANDLE_KEY));
			} catch (error) {
				logger.warn('Could not forget the mocks folder.', error);
			}
		}
	};
}

/**
 * Confirms the handle may still be read, asking the user if the grant has lapsed.
 *
 * Permission does not survive a session, so a handle restored from IndexedDB is only a
 * candidate until this says otherwise. A handle whose directory has since been deleted throws
 * here, which counts as denied.
 */
export async function verifyPermission(handle: DirectoryHandle): Promise<boolean> {
	if (typeof handle.queryPermission !== 'function') return true;
	try {
		if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
		if (typeof handle.requestPermission !== 'function') return false;
		return (await handle.requestPermission({ mode: 'read' })) === 'granted';
	} catch (error) {
		logger.info('The saved mocks folder is no longer readable.', error);
		return false;
	}
}

/** Whether the directory holds at least one `.json`, so opening there would show something. */
async function hasJsonEntry(handle: DirectoryHandle): Promise<boolean> {
	for await (const entry of handle.values()) {
		if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) return true;
	}
	return false;
}

/** Drops a handle that can no longer be used, so the next attempt does not retry it. */
async function discard(store: HandleStore): Promise<void> {
	try {
		await store.clear();
	} catch (error) {
		logger.warn('Could not discard the unusable mocks folder.', error);
	}
}

/**
 * Decides where the chooser should open.
 *
 * The granted mocks folder wins, but only if it is still readable and actually holds a mock —
 * opening in an empty folder is worse than opening in Downloads, where a freshly generated mock
 * will be.
 */
export async function resolveStartIn(store: HandleStore | null): Promise<StartIn> {
	if (!store) return FALLBACK_DIRECTORY;

	let handle: DirectoryHandle | null;
	try {
		handle = await store.get();
	} catch (error) {
		logger.warn('Could not read the saved mocks folder.', error);
		return FALLBACK_DIRECTORY;
	}
	if (!handle) return FALLBACK_DIRECTORY;

	if (!(await verifyPermission(handle))) {
		await discard(store);
		return FALLBACK_DIRECTORY;
	}

	try {
		return (await hasJsonEntry(handle)) ? handle : FALLBACK_DIRECTORY;
	} catch (error) {
		// The directory was moved or removed since it was granted.
		logger.info('The saved mocks folder could not be listed.', error);
		await discard(store);
		return FALLBACK_DIRECTORY;
	}
}

/**
 * Opens the chooser and returns the selected file.
 *
 * `null` means the candidate cancelled, which is ordinary and must stay silent. Anything else
 * is rethrown so the caller can fall back to the plain file input.
 */
export async function pickMockFile(options: {
	backend: PickerBackend;
	store?: HandleStore | null;
}): Promise<File | null> {
	const startIn = await resolveStartIn(options.store ?? null);
	let handles: readonly FileHandleLike[];
	try {
		handles = await options.backend.openFile({ startIn });
	} catch (error) {
		if (isAbortError(error)) return null;
		logger.warn('The file chooser could not be opened.', error);
		throw error;
	}
	const handle = handles[0];
	return handle ? await handle.getFile() : null;
}

/**
 * Asks for the mocks folder once and remembers it.
 *
 * Returns `null` when the candidate declines, which is not an error.
 */
export async function grantMocksDirectory(options: {
	backend: PickerBackend;
	store?: HandleStore | null;
}): Promise<DirectoryHandle | null> {
	let handle: DirectoryHandle;
	try {
		handle = await options.backend.openDirectory();
	} catch (error) {
		if (isAbortError(error)) return null;
		logger.warn('The folder chooser could not be opened.', error);
		throw error;
	}
	if (options.store) await options.store.set(handle);
	return handle;
}

/** Whether a rejection is the candidate closing the chooser rather than a real failure. */
export function isAbortError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { name?: unknown }).name === 'AbortError'
	);
}
