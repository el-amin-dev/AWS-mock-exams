# Runbook — Mock Exam Engine

> Commands only. Not rationale. Not architecture.
> Every command here MUST work as-typed on a fresh clone.
> If behavior changes → this file changes in the SAME PR.

## Setup

```bash
node --version      # 22.x or newer
npm ci              # install exactly what the lockfile pins
```

There is no `.env`, no database, and no backing service. The app is a fully static,
client-rendered site.

## Run

```bash
npm run dev                 # dev server with hot reload on http://localhost:5173
npm run dev -- --open       # same, and open a browser
npm run dev -- --host       # expose on the LAN (to sit an exam from a phone)
```

The app uses ES modules and therefore cannot be opened directly from the filesystem —
`file:///…/index.html` will not work. Use `npm run dev`, `npm run preview`, or the
deployed GitHub Pages URL.

## Test

```bash
npm test                                  # run the suite once
npm run test:watch                        # re-run on change
npm run test:coverage                     # suite plus a v8 coverage report
npx vitest run tests/smoke.spec.ts        # a single file
npx vitest run -t "unscored"              # tests matching a name
```

## Lint / Format

```bash
npm run check               # svelte-check + tsc, must report 0 errors
npm run check:watch         # same, watching
npm run lint                # prettier --check plus eslint
npm run format              # rewrite files to match prettier
```

## Build

```bash
npm run build                             # static site into build/
npm run preview                           # serve build/ at http://localhost:4173
BASE_PATH=/AWS-mock-exams npm run build   # build for a project subpath (what CI does)
```

## Database

_(none — no persistence beyond the browser's localStorage)_

## Smoke checks

```bash
npm run build && npm run preview
# open http://localhost:4173 and confirm the page renders with no console errors
```

## Services / Ports

| Service         | Port | Start command     |
| --------------- | ---- | ----------------- |
| Vite dev server | 5173 | `npm run dev`     |
| Vite preview    | 4173 | `npm run preview` |

## CI / Deploy

- `.github/workflows/ci.yml` — check, lint, coverage and build on every pull request.
- `.github/workflows/pages.yml` — builds with `BASE_PATH` set and deploys to GitHub Pages
  on every push to `main`. Requires **Settings → Pages → Source: GitHub Actions** to be
  enabled once, by hand, in the repository settings.

## Troubleshooting

| Symptom                                                  | Fix                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Cannot find module './$types'`, or `$lib` types missing | `npm run prepare` (runs `svelte-kit sync`)                                               |
| `svelte-check` reports errors only inside `.svelte-kit/` | Stale generated types — delete `.svelte-kit/`, then `npm run prepare`                    |
| Blank page plus a MIME or CORS error in the console      | The site was opened over `file://`. Use `npm run dev` or `npm run preview`               |
| Assets 404 on GitHub Pages but work locally              | `BASE_PATH` was not set at build time; see the build command above                       |
| `npm ci` fails on a lockfile mismatch                    | `rm -rf node_modules package-lock.json && npm install`, then commit the regenerated lock |
