# Architecture

## The shape in one picture

```
  pages/            one per route; owns the screen's state
    │
    ├─ components/  dumb below the page: props in, callbacks out
    │
    ├─ hooks/       one hook per request a screen makes
    │    │
    │    └────────► lib/api.ts ──── the only module that knows a server exists
    │                   │
    │                   ├── fetch(VITE_API_URL ?? "/api")      dev & real backend
    │                   └── import("@/mock/browser_backend")   built demo, no server
    │
    └─ config/      static: the nav tree, the per-target profiles, the user

  lib/              the domain: types and pure rules. No React, no I/O.
    ▲
    │ imported by both sides, so they cannot disagree
    ▼
  mock/             the stand-in backend: router → store → FileStore
    ▲
    │
  server/           the Node half: mounts the router on Vite's dev server
```

Dependencies point downward and inward. A page may import a hook, a component,
config and lib. A hook may import lib. `lib/` imports nothing above it. Nothing
outside `src/mock/` imports `src/mock/` — with one deliberate exception, the
dynamic import in `lib/api.ts` that loads the browser backend as its own chunk.

## The four boundaries

**1. One module knows about HTTP.** `src/lib/api.ts`. Screens call functions
that return data or throw `ApiError`; they never see a URL, a status code or a
`fetch`. Swapping in the real service is this file plus `VITE_API_URL`, and no
screen changes. The contract it speaks is `src/lib/api_types.ts` — the one file
to hand a backend author.

**2. Rules live once, in `lib/`, and the backend imports them.** `statusOf`,
`isValidKey`, `groupKeyOf`, `checkTranslation`, the template field schemas.
`src/mock/store.ts` imports them from `../lib/` rather than restating them, so
the browser and the server can never disagree about what *missing* means. A rule
change is one edit; this is the point of the layout.

**3. The mock is runtime-agnostic.** `src/mock/router.ts` is written against
`Request` and `Response` and knows nothing about Node or Vite. Storage reaches it
as a `FileStore` (`src/mock/file_store.ts`) — a flat store of small text
documents addressed by path. Two implementations exist: real files under
`server-data/` (`server/node_file_store.ts`) and IndexedDB
(`src/mock/browser_backend.ts`). Neither is in the router.

**4. Every key-bearing route is scoped to one target.** Each target is its own
key namespace, so `/entries`, `/keys`, `/translations`, `/import` and `/export`
all take `?target=`. Only `/coverage` and `/reset` span all of them. A change
that makes a route global is almost always a bug.

## Where a request goes

`useTranslationRows("web/school", "vi")`
→ `fetchEntries` in `lib/api.ts`
→ `GET /api/entries?target=web/school&lang=vi`
→ `handleRequest` in `mock/router.ts`
→ `store.entries()` in `mock/store.ts`, which reads `keys.json` and
  `translations/web/school/{en,vi}.json` through the `FileStore`, then computes
  each row's status with `statusOf` and its flags with `checkTranslation`
→ `EntriesResponse` back up the same path.

Writes are the mirror image: `PUT /api/translations/vi?target=web/school` with a
`values` map, and the screen calls the hook's `refresh` afterwards. There is no
cache and no client-side store; a screen's data is whatever its hook last
fetched.

## Two runtimes, one router

| | `npm run dev` | built app, no `VITE_API_URL` |
| --- | --- | --- |
| Where the router runs | Vite dev server, via `server/mock_api.ts` | the browser tab |
| Storage | JSON files under `server-data/` | IndexedDB |
| Entry from the app | `fetch("/api/…")` | `localFetch` from `mock/browser_backend.ts` |
| Zip deflate | Node | `CompressionStream("deflate-raw")` |

Setting `VITE_API_URL` disables both: the browser mock is never even downloaded,
because `lib/api.ts` imports it dynamically and only when `import.meta.env.PROD`
and no API URL is set.

## Screen selection

There is one dynamic route, `/:sectionId/:leafId`. `pages/target_page.tsx` looks
the target up in `config/target_profiles.ts` and renders by its **content kind**,
not by its section:

- `ui` → `pages/translations_page.tsx`, the virtualized key workspace.
- `email` | `sms` | `notification` → `pages/templates_page.tsx`, the message
  table and its two-panel translate dialog.

Adding a target is a nav entry plus a profile. It is not a new route and not a
new page.

## What does not exist yet

No auth, no roles, no releases or versions, no publish, no real backend, no
tests, and no way to create a template in the UI. `config/current_user.ts` is a
constant standing in for a session. Do not design around a session object that
is not there; when one arrives, `current_user.ts` is where it lands.
