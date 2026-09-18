# Localizer Redesign — Progress Report

Date: 2026-09-17
Scope: initial setup of `localization-system-redesign`, the replacement for the legacy CRA app in `localization-web/translator`.

---

## Summary

The new project exists, builds, and runs against the real sample locale data. Four things were done:

1. Scaffolded the base (Vite + Tailwind + shadcn/ui).
2. Analysed the legacy app and wrote a UI/feature brainstorm.
3. Restructured the left menu into the product tree (Web / App / Others).
4. Built the translations screen against `sample-data`, with filtering by group key and release version.

Nothing is connected to a backend yet — all data comes from the local sample files.

---

## 1. Project base

`npm create vite` (react-ts) plus Tailwind v4 and shadcn/ui.

| Layer      | Version / choice                                     |
| ---------- | ---------------------------------------------------- |
| Build      | Vite 8.3 + `@vitejs/plugin-react`                    |
| Language   | TypeScript 6.0, React 19.2                           |
| Styling    | Tailwind CSS v4.3 via `@tailwindcss/vite` (CSS-first) |
| Components | shadcn/ui, `base-nova` style, built on Base UI       |
| Icons      | lucide-react                                         |
| Toasts     | sonner · Theming: next-themes (light/dark)           |
| Virtual    | `@tanstack/react-virtual`                            |
| Lint       | oxlint                                               |

27 shadcn components were generated into `src/components/ui`.

**Node version.** The machine default is Node 16, which cannot run Vite 8 or Tailwind v4 at all. Everything is run with Node 24 from nvm (`nvm use 24`); the requirement is pinned in `.nvmrc`.

**Three fixes were needed in generated code:**

- `baseUrl` removed from both tsconfigs — TypeScript 6 errors on it as deprecated. `paths` alone resolves the `@/*` alias.
- `scroll-area.tsx` shipped an unused `import * as React` that fails `noUnusedLocals` during build. Expect this again on future `shadcn add`.
- `vite.config.ts` uses `import.meta.dirname` instead of `__dirname`, which Vite 8 warns about.

---

## 2. Legacy analysis and brainstorm

Written up in [`docs/redesign_brief.md`](./redesign_brief.md). Source read: all four legacy route screens, the row editor, the API endpoint list and the constants.

Key findings:

- `/Translations` is a **1686-line mega-screen**: app picker (radio strip) → release version (second radio strip) → section (tabs) → language (corner dropdown), all before a single string is visible.
- The row editor exists **four times** — `TextTranslations`, `PdfTranslations`, `SearchResultText`, `SearchResultFile`. A fix in one reaches none of the others.
- Per-row save icon only. No bulk save, no autosave, no dirty state.
- Role checks (`userInfo.role === Roles.Translator`) are inline in render methods, dozens of times.
- Section and Group are two parallel hierarchies, doubling the API surface.
- Publish is three overlapping concepts (Allow publish, Lock app, Publish to env), partly non-functional.

The brief proposes a route structure, screen-by-screen UI, features beyond parity (translation memory, validation panel, per-key comments, history), a technical stack, a build order and six open questions.

---

## 3. Left menu restructured

The sidebar is now the product tree rather than a list of app functions.

```
Web                 App                 Others
  School      12      Baby                Mail invite user
  Curriculum   4      Parent        8     SMS invite user      2
  Training            Student       3     Mail notification
  Content     27
```

- `src/config/nav_items.ts` — the tree as data (id, title, icon, outstanding count). Adding or renaming a target is a one-line edit.
- `src/components/layout/app_sidebar.tsx` — collapsible groups, rotating chevron, count badges, active highlighting; the group holding the active item opens by default.
- `src/components/layout/app_header.tsx` — breadcrumb driven by the selection (`Web › School`).

Counts are placeholder values for now. The old nav entries (Applications, Groups, Releases, Users, Settings) were removed with this change and still need a home.

---

## 4. Translations screen, wired to `sample-data`

### The data

`sample-data/locale/*.json` — one flat file per language:

```json
{ "group.sub.key": "value" }
```

- **3339 keys**, **13 languages** (en, zh-Hans, ms, ja, ko, ru, vi, mn, es, ar-SA, th, my, km).
- **156 group keys** — the first dot-segment of a key (`nav`, `student`, `eventmanager`, …), the same convention the legacy importer used to split a file into sections.
- Key depth is mostly 3 segments (2598 of 3339).

Measured coverage against English:

| Language | Translated keys | %     | Note                            |
| -------- | --------------- | ----- | ------------------------------- |
| ru       | 3131            | 93.8% |                                 |
| mn       | 3128            | 93.7% |                                 |
| ms       | 3087            | 92.5% |                                 |
| ja       | 3006            | 90.0% |                                 |
| ko       | 2803            | 83.9% |                                 |
| th       | 2355            | 70.5% |                                 |
| vi       | 2038            | 61.0% |                                 |
| zh-Hans  | 193             | 5.8%  | mostly still English            |
| es       | 8               | 0.2%  | effectively an English copy     |
| ar-SA    | 3               | 0.1%  | effectively an English copy     |
| km       | 2               | 0.1%  | effectively an English copy     |
| my       | 2               | 0.1%  | effectively an English copy     |

"Translated" = the key exists in the target file and its value differs from English, out of 3339 English keys.

All languages are missing the same 3 keys that exist in `en.json`, and carry 1–2 keys that English does not.

### The implementation

- `src/lib/locale_data.ts` — language list, lazy per-language loading via `import.meta.glob` (each bundle is ~200 KB, so never loaded eagerly; Vite code-splits them into separate chunks of 44–57 KB gzipped), row building, group-option counting.
- **Status is derived from the data**, not stored: `missing` (key absent from the target file), `untranslated` (value still identical to English), `translated` (value differs). This is what produces the coverage table above.
- `src/hooks/use_translation_rows.ts` — loads English + the selected target language and pairs them into rows.
- `src/components/translations/group_filter.tsx` — searchable combobox over the 156 group keys, each showing outstanding / total. A plain select is unusable at that size.
- `src/components/translations/translation_row.tsx` — **one** row editor, reused everywhere, per the rule from the brief. Copy-English action, status and release badges, `dir="rtl"` for Arabic.
- `src/pages/translations_page.tsx` — the screen: filters, virtualized list, dirty-state bar.

### Filters delivered

| Filter              | Control                                                        |
| ------------------- | -------------------------------------------------------------- |
| **Group key**       | Searchable combobox, 156 options with counts                   |
| **Release version** | Select: All / v2.4 / v2.5 / v2.6 / unassigned                  |
| Language            | Select, 13 languages                                           |
| Status              | Chips: All / Missing / Same as English / Translated            |
| Text                | Search across key, English source and translation              |

A completion bar shows percentage and counts, and follows the release filter. The list is virtualized — 3339 editable rows would otherwise be unusable. Edits collect into a dirty set with a Save all / Discard bar (mock save, no backend).

### Known mock

`src/mock/release_assignment.ts` assigns each key to a release by a deterministic hash of its name (~70% spread over three releases, ~30% unassigned). **The sample locale files contain no release information** — release lives in the backend, not the JSON bundle. This file is designed to be deleted once a real API exists; it does not affect the UI.

---

## 5. Verification

- `npm run build` (tsc + vite) — passes.
- Dev server — starts and serves HTTP 200 on :5173.
- Locale loading — verified against the dev server that all 13 glob paths resolve and `vi.json` is served.
- `npm run lint` (oxlint) — **0 errors, 8 warnings**: 6 in generated shadcn files (`only-export-components` on variant exports, `set-state-in-effect` in shadcn's own `use-mobile`), 1 fixed during the session (`set-state-in-effect` in `use_translation_rows.ts`, now derived during render instead of reset inside the effect), and 1 unavoidable (`incompatible-library` for `useVirtualizer` — the React Compiler skips memoizing the component; harmless here since no virtualizer value reaches a memoized child).

**Not verified:** the rendered page has not been opened in a browser. Correctness so far rests on types, build and module resolution only.

---

## 6. Open questions

1. **Fourth menu item** — the menu was specified as four main items but three were listed (Web, App, Others). What is the fourth?
2. **Where do Users / Settings live** now that the sidebar is the product tree — a footer, or a separate admin area?
3. **How is release version actually represented** — metadata alongside the locale files, or a backend field only? This determines whether `src/mock/release_assignment.ts` is replaced by a loader or by an API call.
4. **Sections vs Groups** — keep both hierarchies, or collapse to one?
5. **Backend scope** — is the redesign frontend-only against the existing endpoints, or can the API change?
6. **Per-target data** — every menu target currently shows the same sample dataset. How are the nine targets separated in real data: one locale bundle per target, or one bundle filtered by group key?

---

## 7. Suggested next steps

1. ~~React Router~~ — done, see section 8. Still to move into the URL: `release`, `status` and the text query.
2. API client + TanStack Query, with MSW mocks so the screens can progress before the backend does.
3. Autosave with a retry queue, replacing the mock Save all.
4. The context panel from the brief: screenshot, notes, history, placeholder validation.
5. Auth pages and the RBAC permission map.

---

## 8. Routing and the new home screen

Added after the first pass, replacing the single-screen app (one `activeId` held in `App.tsx` state) with real routes.

### Routes

React Router 7 (`react-router`), declarative router in `src/App.tsx`:

| Path                  | Screen                                                                                |
| --------------------- | ------------------------------------------------------------------------------------- |
| `/`                   | Dashboard                                                                             |
| `/:sectionId/:leafId` | Translations workspace — `/web/school`, `/app/parent`, `/others/mail-invite-user`      |
| `*`                   | redirect to `/`                                                                       |

- `src/components/layout/app_layout.tsx` — the shell (sidebar + header + `<Outlet />`), shared by every route.
- The path segments **are** the nav ids, so `navPath(section, leaf)` in `src/config/nav_items.ts` is the only place a target URL is built. Sidebar items and dashboard shortcuts are `<Link>`s; the breadcrumb and the active highlight are derived from `useLocation()`, not from component state.
- A path naming an unknown target falls back to the dashboard.
- **Filters in the query string**: `?lang=vi&group=nav`. The language and group selects read from and write to the URL (`replace: true`, so filtering does not fill the back stack), which is what lets a dashboard link open the list already scoped. `release`, `status` and the search box are still local state.

### Dashboard (`/`)

The home screen is no longer the translations table. `src/pages/dashboard_page.tsx`:

1. **Four stat tiles** — source keys (3,339 across 156 groups), target languages (12), average coverage (49%), outstanding strings (20,312 = missing + still-English across all languages).
2. **Shortcuts** — every nav leaf as a card, grouped by Web / App / Others, carrying its outstanding badge. This replaces hunting through the sidebar tree to pick a target.
3. **Language coverage** — all 12 target languages, least complete first, each with a progress bar and a missing / still-English split. Clicking one opens the workspace at that language.
4. **Where the gaps are** — for a selected language, the five groups with the most outstanding keys. Clicking one opens the workspace scoped to that language *and* that group.

### Where the dashboard numbers come from

`src/data/locale_coverage.ts`, **generated** by `node scripts/generate_coverage.mjs` from `sample-data/locale/*.json`. Counting coverage at runtime would mean downloading all 13 bundles (~200 KB each, 2.6 MB) just to draw the home screen. The generated module is a few KB and holds per-language totals plus the five worst groups per language. Replace it with an API call once the backend can report progress; re-run the script if the sample data changes.

### Verification

- `npm run build` (tsc + vite) — passes.
- All four route shapes (`/`, `/web/school`, `/app/parent`, an unknown path) render without error under a server-side smoke render, with the right breadcrumb, active sidebar item and expanded group.
- `npm run lint` — 0 errors, 7 warnings, all pre-existing (generated shadcn files plus `useVirtualizer`).
- **Not verified:** still not opened in a browser — no click-through and no visual check.

---

## 9. Status, the add-key flow, and a mock backend

Date: 2026-09-18.

### What "missing" means now

Status used to be presence-only — a key that existed in the target bundle counted as translated, whatever it held. Every language therefore read ~100% complete, which was true of the export and false of the translation.

A key is now **missing** when the target bundle has nothing usable for it, in any of three ways:

1. the key is absent,
2. its value is empty,
3. its value is a verbatim copy of the English source.

Case 3 is the one that moved the numbers, because the bundles are exported with English as the fallback for untranslated strings. The rule is skipped when the selected language *is* English.

| Language | translated | missing |
| -------- | ---------: | ------: |
| km, my   |          2 |   3,337 |
| ar-SA    |          3 |   3,336 |
| es       |          8 |   3,331 |
| zh-Hans  |        193 |   3,146 |
| vi       |      2,038 |   1,301 |
| th       |      2,355 |     984 |
| ko       |      2,803 |     536 |
| ja       |      3,006 |     333 |
| ms       |      3,087 |     252 |
| mn       |      3,128 |     211 |
| ru       |      3,131 |     208 |

Five of the twelve bundles are, to within a handful of strings, copies of `en.json`. That was always the case; the old rule hid it.

One consequence worth knowing: the row's "copy English" button now produces a row that saves as missing.

### `statusOf` has one definition

`src/lib/locale_data.ts` is the domain model — types, `groupKeyOf`, `statusOf`, the key format — and holds no I/O, so the mock backend imports it directly. `src/lib/validation.ts` likewise. The generated `src/data/locale_coverage.ts` and `scripts/generate_coverage.mjs`, which restated both and carried a "keep the two in step" comment, are gone.

### A mock backend, because the browser cannot write files

`server/mock_api.ts` is a Vite plugin that serves `/api` from the dev server, and `server/store.ts` keeps the data in files:

```
server-data/                 (gitignored, seeded from sample-data on first request)
  keys.json                  key, group, target, origin, createdAt
  translations/<code>.json   { key: value }, one per language
```

The registry holds no text and `en.json` is a language file like any other, which is how a real schema would separate a key from its translations. Endpoints are listed in the README; `src/lib/api_types.ts` is the contract, shared by both sides.

Swapping it for the real service: delete `mockApi()` from `vite.config.ts`, set `VITE_API_URL`, and reconcile `src/lib/api.ts`. Nothing else imports a server.

### The screens

- **Add key** (`/keys/new`) — key plus English text. `POST /api/keys` writes the English string to `en.json`, an empty value to the other twelve files and a row to the registry, so the key is missing in every language from the moment it exists. The panel beside the form shows all 13 languages for the selected key, each untranslated one linking to the workspace scoped to that language and key. Keys added here are listed from the registry by `origin=manual`, so they survive a restart.
- **Workspace** — rows arrive from `GET /api/entries` with status already computed; "Save all" is `PUT /api/translations/:lang` and reports the file it wrote. The row search is in the URL (`?q=`), which is what lets the add-key screen link at one key.
- **Dashboard** — `GET /api/coverage` replaces the generated module. The server counts its own files with the same `checkTranslation` the rows use, so adding a key moves the numbers.

### Verification

- `npm run build` (tsc + vite) — passes. The 13 locale bundles are no longer in the client bundle; the app fetches instead.
- `npm run lint` — 0 errors, 7 warnings, all pre-existing.
- The API was exercised end to end against a running dev server: seed (3,339 keys, 156 groups, coverage matching the table above), create, duplicate → 409, malformed key → 400, fan-out to 13 files, save, status flip, coverage recount to 3,340 keys, delete, unknown key → 404, unknown language → 404, unknown route → 404, a key containing a slash, and a UTF-8 round trip (`Lưu trữ {name} — ✓ 日本語`) read back byte-identical from disk.
- **Not verified:** still not clicked through in a browser.

---

## 10. Add key belongs to an app, not to the product

Date: 2026-09-18.

The add-key screen from section 9 was a single global page with the target hard-coded to School. That was wrong in the same way the legacy mega-screen was wrong: it asked "what key?" before "in which app?", when the answer to the second question changes every other answer. Each app is its own key namespace, so there is no product-level "add a key".

### The feature moved into the workspace

- `src/components/translations/add_key_dialog.tsx` — a dialog opened from the workspace toolbar, and from the empty state of an app with no keys. It posts the screen's own target, so a key can only be created in the app you are looking at.
- After the server answers, the dialog shows the fan-out it performed: all 13 languages for that app, English holding the source and the other twelve linking to themselves in the workspace. "Add another" stays in the dialog; closing it leaves the list filtered to the new key.
- Deleted: `src/pages/add_key_page.tsx`, the `/keys/new` route, `addKeyPath`, the sidebar entry, the dashboard button, and — with the page that used them — `GET /api/keys/values`, the `origin` filter on `/entries`, and `src/hooks/use_key_values.ts`.
- Keys added by hand are still findable: rows carry `origin`, so the row shows a **New** badge with a delete button, and the filter row gains an **Added here** chip when the app has any.

### Every app now has a list

The workspace used to gate on `profile.bundle` and render a "no source bundle" card for the nine apps without one, which left nowhere to add a key to those apps. It now fetches for every app; an app with no keys gets its profile card plus **Add key**, which is the way out of the empty state.

### The files are namespaced per app

Scoping the registry by target was not enough — the value files were still one shared pool, so a key added to `app/parent` physically landed in School's `en.json`. They are now nested:

```
server-data/
  keys.json
  translations/<app>/<code>.json     web/school/vi.json, app/parent/vi.json, …
```

Only `web/school` is seeded, from `sample-data/locale`. Another app has no folder until its first key. Consequently `PUT /api/translations/:lang` and `DELETE /api/keys` both take `target`, and key uniqueness is per app rather than global — `home.greeting.title` can exist in `app/parent` and `app/student` at once and mean different things.

A `server-data/` left over from the flat layout is detected and re-seeded automatically.

### Verification

- `npm run build` (tsc + vite) — passes. `npm run lint` — 0 errors, 7 warnings, all pre-existing.
- Exercised against a running dev server: created `home.greeting.title` in `app/parent` (13 files written under `translations/app/parent/`, absent from School's 3,339), created the *same* key in `app/student` (201, its own files), rejected it as a duplicate within `app/parent` (409), saved a Vietnamese value into `app/parent/vi.json` only, rejected a save with no target (400), deleted from `app/parent` and confirmed `app/student` kept its copy, got a 404 deleting it from the wrong app, and reset back to 3,339 imported keys in 14 files.
- **Not verified:** still not clicked through in a browser.

---

## 11. Export

Date: 2026-09-18.

A consumer app can now be exported as a zip of locale files, named by whoever exports it.

### The shape of it

`src/components/translations/export_dialog.tsx`, opened from the workspace toolbar beside **Add key**:

- a **File names** pattern, `{lang}.json` by default, where `{lang}` is the language code;
- a checkbox per language — English and the language being worked on pre-ticked, with All / None — each row carrying its own editable file name, seeded from the pattern, and a name typed over a row wins and stays put;
- an **Archive name** field, defaulting to `<app>-translations`, with `.zip` as a fixed suffix;
- **Include untranslated keys** — on by default.

Naming each file matters more than naming the archive: the application receiving it decides what its locale files are called. `zh-Hans` here may have to arrive as `zh_CN.json`, and a Flutter app wants `messages_vi.arb`. Duplicate names are refused on both sides — two entries of one name make an archive that unzips to one file, silently losing a language.

`POST /api/export` answers with the archive; a body rather than a query string because a dozen arbitrary file names do not belong in a URL. Contents are the same shape as the files on disk, so the result drops straight into an application.

**The export is always the whole app**, never the current filters. An export is a release artifact; having it depend on a search box someone left filled in is how the wrong bundle ships.

**Untranslated means what the rest of the app means by missing** — empty *or* still a verbatim copy of English — because it reuses `statusOf`. Unticking the box drops those keys entirely rather than shipping blanks, so the application falls back to English on its own. For School that is the difference between `km.json` with 3,339 entries and `km.json` with 2.

### Two things that needed solving

**No archive format in Node.** `zlib` deflates but does not package. `server/zip.ts` writes the PKZIP subset every unzip tool reads — local headers, a central directory, an end-of-central-directory record, CRC-32 and DOS timestamps — in about 80 lines, which beats a dependency in a mock backend.

**Non-ASCII file names.** HTTP header values are latin1 and Node throws on anything outside it, so `filename="Bảng dịch.zip"` killed the response mid-flight. The header now carries both forms per RFC 6266: an ASCII fallback in `filename` and the percent-encoded UTF-8 in `filename*`, which the client prefers. A localization tool whose export breaks on a Vietnamese file name would be a poor joke.

Related: Vite's dev server resets any request whose URL contains `../../`, before a plugin middleware sees it, so sanitising the name only on the server was not enough — the request never arrived. `src/lib/file_name.ts` is now shared by the dialog and the route, and the dialog shows the resolved name under the field when it differs from what was typed.

### Verification

- `npm run build` (tsc + vite) — passes. `npm run lint` — 0 errors, 7 warnings, all pre-existing.
- Exported `en,vi,ja` from School: a 145 KB zip that `unzip -l` lists correctly and `unzip` extracts to three parseable files of 3,339 keys each.
- Custom names honoured: `en-US.json`, `zh_CN.json` and `messages_vi.arb` came out of one archive with 3,339 keys each.
- `includeUntranslated: false` over `en,vi,km`: 3,339 / 2,038 / 2 keys — matching the coverage endpoint's translated counts exactly.
- Names: an empty entry name falls back to `<code>.json`, `../../evil.json` lands as `evil.json`, two entries called `same.json` / `SAME.json` are refused with 400, `school.zip` → `school`, `../../etc/pa:sswd.zip` → `etcpasswd`, and `Bảng dịch` survives the round trip with the archive contents intact.
- Errors: no files → 400, no target → 400, unknown language → 404, an app with no keys → 404.
- **Not verified:** still not clicked through in a browser.

---

## 12. The audit trail, and a copy button that copied nothing

### Who added the key, who last wrote the value

The workspace could say a string was wrong but not who to ask about it. Two
stamps now travel with every row and show in a third column:

- **Created by / Created at** — who put the key in the registry, and when. The
  same in every language, so it lives on the key record (`KeyRecord.createdBy`).
- **Updated by / Updated at** — who last saved *this language's* value, and
  when. Per language, so it lives in a log beside the bundle:
  `audit/<app>/<code>.json`, keyed the same way the bundle is.

Four labelled facts rather than two compact stamps: a reviewer reads down the
label column looking for one of them, and `Updated at` says what it is without
having to be learned first.

**Beside the bundle, not inside it.** A bundle is a plain `key: text` document
that gets exported and shipped into an application; an audit trail has no
business travelling with it. Keeping the log in its own document also means the
export, the coverage count and `statusOf` needed no changes at all.

**Imported text is stamped with the import, not left blank.** The sample
bundles arrived with 2,038 Vietnamese translations that predate any trail.
Showing nothing for them would read as "nobody has touched this", which is a
different answer from "we have no record". A row with a value and no logged
stamp falls back to the key's own — `Bundle import` for imported keys, the
creator's name for keys added here. A row with no value shows nothing, because
nothing has happened to it yet.

**Emptying a value drops its stamp.** The row is back to untranslated, and a
stamp on it would read as a translation somebody made.

**Who is saving.** There is no sign-in, so `src/config/current_user.ts` is a
placeholder that `lib/api.ts` attaches to every write — screens do not carry
it. The mock believes what it is sent and records `Unknown` when nothing is.
A real service takes the author from the session and ignores the field: an
audit trail the client can forge is not one. That is the one line to delete
when auth arrives.

**Existing `server-data` re-seeds itself.** A registry written before this has
no `createdBy`, so `ready()` treats it as stale and re-seeds from
`sample-data` — the same thing `npm run mock:reset` does, on working data
that is meant to be disposable.

### The copy button

The button under the copy icon did not copy. It pasted the English *into* the
translation field — useful, and the reason it survived this long, but not what
a copy icon promises, so it read as broken to anyone who clicked it expecting
the clipboard.

Both jobs are real, so there are now two buttons in both places that had one
(the workspace row and the template field editor): **Copy** puts the English on
the clipboard, **Paste** drops it into the field as a starting point.

`lib/clipboard.ts` is the copy itself, and it does not only call
`navigator.clipboard`: that API exists only in a secure context, so opening the
dev server on a LAN address to read a translation on a phone would have made
the fixed button fail silently in exactly the same way. It falls back to the
old textarea trick, returns whether the text made it, and the caller toasts
either way.

### Verification

- `npm run build` (tsc + vite) — passes. `npm run lint` — 0 errors, 7 warnings,
  all pre-existing.
- A smoke test drove the mock router against a throwaway data root: seeded rows
  carry both stamps; an empty value carries none; a save names the editor and
  writes `audit/web/school/vi.json`; clearing a value clears its stamp; a key
  added through the API names its author, with its English credited to them and
  its empty Vietnamese credited to nobody; a save with no author recorded
  `Unknown`; deleting a key removed its stamp from the log.
- **Not verified:** still not clicked through in a browser.
