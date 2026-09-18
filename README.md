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
| Motion     | `motion` (Framer Motion's successor package)      |
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
npm run preview     # serve the production build (mock API runs in the browser)
npm run lint        # oxlint
npm run mock:reset  # delete server-data/, re-seeded on the next request
```

## Layout

```
server/            the mock backend's Node half — see below
  mock_api.ts      the Vite plugin that mounts it on the dev server at /api
  node_file_store.ts   its storage: JSON files under server-data/
sample-data/
  locale/          the seed: one locale bundle per language
  templates.json   the seed: every email, SMS and notification template
src/
  components/
    dashboard/     home screen cards
    layout/        app shell (sidebar, header)
    templates/     template table, translate dialog, rich text editor, preview
    translations/  workspace row, filters, profile card
    ui/            shadcn/ui components (generated — edit with care)
  config/          nav tree, per-target profiles
  hooks/           one hook per request the screens make
  lib/
    api.ts         the HTTP client — the only module that knows a server exists
    api_types.ts   the request/response contract, shared with the mock
    locale_data.ts the domain model and its pure rules, shared with the mock
    template_data.ts   the template model and field schemas, shared with the mock
    template_preview.ts placeholder samples + the HTML whitelist
    validation.ts  per-row checks, shared with the mock
  mock/            the mock backend proper — runtime-agnostic, see below
    router.ts      the routes, as Request → Response
    store.ts       the data, over a FileStore it is handed
    file_store.ts  that interface, and the seed interface beside it
    browser_backend.ts  storage + seeding for a deploy with no server
    zip.ts         the export archive
  pages/
    target_page.tsx  picks the screen from the target's content kind
  index.css        Tailwind entry + shadcn design tokens
```

`@/*` is aliased to `src/*` in both `vite.config.ts` and `tsconfig*.json`.

## Adding components

```sh
npx shadcn@latest add <component>
```

Generated files occasionally ship an unused `import * as React` which trips `noUnusedLocals` during `npm run build`; delete the line when it happens.

## Mock backend

There is no real service yet, so the app talks to one that ships with it. The
routes are in `src/mock/router.ts`, written against `Request` and `Response`
and so tied to no particular server; `src/mock/store.ts` holds the data behind
a `FileStore` interface. That pair runs in two places:

- **`npm run dev`** — `server/mock_api.ts` mounts the router on the Vite dev
  server at `/api`, and `server/node_file_store.ts` keeps the data in real
  files you can open in the editor.
- **a built app with no `VITE_API_URL`** — `src/mock/browser_backend.ts` runs
  the same router in the tab, over IndexedDB, and `src/lib/api.ts` calls it
  instead of `fetch`. This is what makes `npm run preview` and a static deploy
  work at all; see **Deploying** below.

Either way the data is seeded from `sample-data/locale` the first time it is
asked for anything, into the same layout:

```
server-data/                      (on the dev server; gitignored, disposable)
  keys.json                       the key registry: key, group, target, origin
  templates.json                  the template registry: name, category, owner
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
| GET    | `/api/templates?target=&lang=`       | one channel's templates, text included      |
| POST   | `/api/keys`                          | create a key in one app, in every language  |
| DELETE | `/api/keys?target=&key=`             | delete one app's key, from every language   |
| PUT    | `/api/translations/:lang?target=`    | save a batch of one app's translations      |
| POST   | `/api/export`                        | a .zip, one named file per language         |
| GET    | `/api/coverage`                      | totals across every app, for the dashboard  |
| POST   | `/api/reset`                         | re-seed from `sample-data`                  |

Every route but `/coverage` and `/reset` is scoped to one app, because the app
is what owns the keys.

`/export` answers with a zip built by `src/mock/zip.ts` — about 80 lines of
PKZIP headers, which beat a dependency for the job. The request names every
file in it, because the application receiving the archive decides what its
locale files are called: `zh-Hans` here may have to arrive as `zh_CN.json`, and
a Flutter app wants `.arb`. That is a body rather than a query string, hence
the POST.

Contents are the same shape as the files on disk, so an export can be dropped
straight into an application. `includeUntranslated: false` leaves out the keys
`statusOf` calls missing, which is what a runtime bundle wants: the key is
absent, so the app falls back to English by itself.

`statusOf` and `checkTranslation` are imported by the server from
`src/lib` rather than restated, so the browser and the backend cannot disagree
about what "missing" means.

## Message templates

The three Messages targets — `others/email`, `others/sms`,
`others/notification` — hold templates rather than loose UI strings, and get
their own screen: a table of messages, and a two-panel dialog that translates
one of them beside a rendered preview.

A template is **not** a fourth kind of storage. Its text is ordinary keys in
that channel's bundle, one per field —

```
invite_coach.subject   invite_coach.body   invite_coach.cta   …
```

— so status, validation, saving, export and the dashboard's coverage all work
on it unchanged, and the translate dialog saves through
`PUT /api/translations/:lang` like every other screen. `templates.json` holds
only what a key cannot carry: the message's name, who receives it (the
category), which product sends it (the owner) and who created it. The field
schema per channel lives in `src/lib/template_data.ts` and is shared with the
server.

The mail body is edited as rich text (`components/templates/rich_text_editor.tsx`,
`contenteditable` + `execCommand`, no editor dependency) with the raw HTML one
toggle away. Both the editor's output and the preview's input go through the
tag whitelist in `lib/template_preview.ts`: the editor *unwraps* what it does
not know, because that markup came from the browser; the preview *escapes* it,
because that markup came from a bundle and a translator should see the
`<script>` they are about to ship. Nothing else is ever handed to
`dangerouslySetInnerHTML`.

Two rows in the seed are deliberately wrong, so the "needs review" counts have
something to find: `visitation_scheduled` is missing a `</p>` in Vietnamese, and
`push_story_ready` translates `{firstName}` as `{studentName}`.

**Swapping in the real backend:** delete `mockApi()` from `vite.config.ts` and
the `src/mock/` folder, set `VITE_API_URL` to the service, and reconcile
`src/lib/api.ts` with whatever shapes it returns. No screen imports anything
else. The contract to hand the backend author is `src/lib/api_types.ts`.

`server-data/` is per-checkout rather than shared, and so is the browser's
IndexedDB copy — the mock has no notion of two people working at once.

## Deploying

`npm run build` produces a `dist/` of static files and nothing else. There is
no Node process to deploy: the dev server's `/api` is a Vite plugin and does
not survive a build, which is why the mock moves into the browser. `vercel.json`
is committed and is the whole configuration — build command, output directory,
and the rewrite that sends every path to `index.html` so React Router's deep
links resolve.

On Vercel, import the repo and deploy — this folder is the repository root, so
the default settings and `vercel.json` between them are enough. Any other
static host works the same way: serve `dist/`, fall back to `index.html`.

One browser requirement comes with it. The export builds its archive with
`CompressionStream("deflate-raw")`, which is Chrome 103+, Safari 16.4+ and
Firefox 113+. On the dev server Node does the deflating and none of that
applies; in a deployed build the tab does, and an older browser can use every
screen but cannot download a zip.

What the deployed demo is, and is not: every visitor gets their own copy of the
sample data in their own browser, seeded on first load from the sample JSON
(~3 MB, fetched once and then kept in IndexedDB). They can translate, add keys,
export and reset; nobody sees anybody else's edits, and clearing site data
starts them over. That is a design prototype people can click through, not a
shared workspace. A deployment that is one needs a real service behind
`VITE_API_URL` — at which point the browser mock is never loaded.

## Current state

Routing, a dashboard, a per-app workspace — list, filters, row editor, bulk
save, an add-key dialog and a zip export — and the message-template screen
above, all against the mock backend. No auth, no publishing, no releases, no
import, and no way to create a template in the UI yet (they are seeded).

Seeded: School, from `sample-data/locale`, and the three message channels, from
`sample-data/templates.json`. The other six apps open on their profile and an
invitation to add the first key.
