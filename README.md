# localization-system-redesign

Base for the Localizer redesign — the replacement for the legacy CRA app in `../localization-web/translator`.

## Stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| Build      | Vite 8 + `@vitejs/plugin-react`                   |
| Language   | TypeScript 6, React 19                            |
| Styling    | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first)  |
| Components | shadcn/ui (`base-nova` style, Base UI primitives) |
| Icons      | lucide-react                                      |
| Toasts     | sonner                                            |
| Theming    | next-themes (`class` strategy, light/dark)        |
| Lint       | oxlint                                            |

## Requirements

Node 20+ (the repo pins **24** via `.nvmrc`). The machine default of Node 16 will not run Vite 8 or Tailwind v4.

```sh
nvm use 24
npm install
```

## Scripts

```sh
npm run dev         # app on http://localhost:5173, mock API on /api
npm run build       # tsc -b && vite build
npm run preview     # serve the production build (no API — see below)
npm run lint        # oxlint
npm run mock:reset  # delete server-data/, re-seeded on the next request
```

## Layout

```
server/            the mock backend (Vite middleware) — see below
  mock_api.ts      routing
  store.ts         JSON files under server-data/
sample-data/       the seed: one locale bundle per language
src/
  components/
    dashboard/     home screen cards
    layout/        app shell (sidebar, header)
    translations/  workspace row, filters, profile card
    ui/            shadcn/ui components (generated — edit with care)
  config/          nav tree, per-target profiles
  hooks/           one hook per request the screens make
  lib/
    api.ts         the HTTP client — the only module that knows a server exists
    api_types.ts   the request/response contract, shared with server/
    locale_data.ts the domain model and its pure rules, shared with server/
    validation.ts  per-row checks, shared with server/
  pages/           screens
  index.css        Tailwind entry + shadcn design tokens
```

`@/*` is aliased to `src/*` in both `vite.config.ts` and `tsconfig*.json`.

## Adding components

```sh
npx shadcn@latest add <component>
```

Generated files occasionally ship an unused `import * as React` which trips `noUnusedLocals` during `npm run build`; delete the line when it happens.

## Mock backend

There is no real service yet, so the app talks to one that lives in the dev
server: `server/mock_api.ts`, mounted at `/api`. It reads and writes plain
JSON files, seeded from `sample-data/locale` the first time it is asked for
anything:

```
server-data/                      (gitignored, disposable)
  keys.json                       the key registry: key, group, target, origin
  translations/<app>/<code>.json  one file per app per language
```

Each app is its own key namespace — `web/school` and `app/parent` can both
define `nav.home` and mean different things — so the value files are nested per
app. Only `web/school` is seeded, from `sample-data/locale`; another app has no
folder until someone adds its first key.

English is not special: `<app>/en.json` is a language file like any other and
the registry holds no text. Adding a key writes the English string to that
app's `en.json`, an empty value to its other twelve files and a row to
`keys.json` — which is why a new key shows up as *missing* in every language at
once, and in that app only.

| Method | Path                                 | Purpose                                     |
| ------ | ------------------------------------ | ------------------------------------------- |
| GET    | `/api/entries?target=&lang=`         | one app's keys, status computed            |
| POST   | `/api/keys`                          | create a key in one app, in every language  |
| DELETE | `/api/keys?target=&key=`             | delete one app's key, from every language   |
| PUT    | `/api/translations/:lang?target=`    | save a batch of one app's translations      |
| GET    | `/api/coverage`                      | totals across every app, for the dashboard  |
| POST   | `/api/reset`                         | re-seed from `sample-data`                  |

Every route but `/coverage` and `/reset` is scoped to one app, because the app
is what owns the keys.

`statusOf` and `checkTranslation` are imported by the server from
`src/lib` rather than restated, so the browser and the backend cannot disagree
about what "missing" means.

**Swapping in the real backend:** delete `mockApi()` from `vite.config.ts`, set
`VITE_API_URL` to the service, and reconcile `src/lib/api.ts` with whatever
shapes it returns. No screen imports anything else. The contract to hand the
backend author is `src/lib/api_types.ts`.

Two consequences of hosting the API in the dev server: `npm run preview` serves
the built app with no API behind it, and `server-data/` is per-checkout rather
than shared.

## Current state

Routing, a dashboard, and a per-app workspace — list, filters, row editor,
bulk save, and an add-key dialog — all against the mock backend. No auth, no
publishing, no releases, no import. Only School is seeded; the other nine apps
open on their profile and an invitation to add the first key.
