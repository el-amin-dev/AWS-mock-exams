/**
 * The domain layer's public surface.
 *
 * Everything here is pure: no DOM, no Svelte, no storage, no clock of its own. The UI
 * depends on this module; nothing in this module depends on the UI.
 */

export * from './constants';
export * from './random';
export * from './report';
export * from './scoring';
export * from './timer';
export * from './types';
export * from './validation';
