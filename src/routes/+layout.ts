/**
 * Static, client-only app: prerender the shell at build time and never server-render.
 * Every screen depends on browser state (localStorage, timers, file input), so SSR
 * would produce markup the client immediately discards.
 */
export const prerender = true;
export const ssr = false;
