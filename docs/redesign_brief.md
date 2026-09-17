# Localizer Redesign — UI & Feature Brainstorm

Input: legacy app `localization-web/translator` (React 16 + antd 3, ~12k lines) and `localization-web/docs/legacy_feature_brief.md`.
Status: **brainstorm / proposal**, not decisions. Everything here is up for cutting.

---

## 1. What the legacy app actually is

| Screen                | Route            | Size       | What it does                                                              |
| --------------------- | ---------------- | ---------- | ------------------------------------------------------------------------- |
| Translations          | `/Translations`  | 1686 lines | Everything: app picker, version picker, section/group tabs, search, notes |
| TextTranslations      | (child)          | 1549 lines | The string grid + add-key drawer + publish/lock/download/upload buttons   |
| PdfTranslations       | (child)          | 1313 lines | Near-duplicate of the above, for files                                    |
| Developer             | `/Developer`     | 1243 lines | Apps & Sections table, add/edit app drawer, JSON import drawer            |
| ArrangeGroups         | `/Groups/:appId` | 1149 lines | Dual-pane drag & drop, section to group                                   |
| SearchResultText/File | (child)          | 1292 lines | A third and fourth copy of the row editor                                 |
| Admin                 | `/Admin`         | 375 lines  | Users table, invite modal, manage modal                                   |

### Problems worth naming

1. **One mega-screen.** Everything a translator does happens inside `/Translations`: app as a radio-button strip, release version as a second radio strip, sections as tabs, language as a dropdown in the corner. Four selectors stacked before you see a single string.
2. **The row editor exists four times** — `TextTranslations`, `PdfTranslations`, `SearchResultText`, `SearchResultFile`. A fix in one does not reach the others.
3. **Per-row save icon.** No bulk save, no autosave, no dirty indicator, no undo. A translator saves 300 keys with 300 clicks.
4. **Roles checked inline, everywhere.** `userInfo.role === Roles.Translator` appears dozens of times inside render methods, sometimes deciding column widths. Adding a role means touching every file.
5. **Section and Group are two parallel hierarchies** with a "Group view" toggle, doubling every API (`GetTranslations` / `GetGroupTranslations`, `SearchTextTranslationV2` / `SearchTextTranslationForGroupV2`) and every code path.
6. **`Ignore` is overloaded** at app, section, group and key level, and mixes two meanings: "not to be translated" and "hide from my progress count".
7. **Publish is three overlapping concepts** — Allow Publish flag, Lock app, Publish / Publish to Test / Publish to Live — and the brief flags parts of it as not working.
8. **JSON import is marked "không hoạt động"** in the brief. It is also the only way to get strings into the system.
9. **Stack is 2018.** `react-scripts@1.1.5`, antd 3.16, jQuery, `react-notify-toast`. No dark mode, no RTL (despite Arabic being a supported language), no virtualization (PerfectScrollbar over a plain `map`).

---

## 2. Proposed information architecture

Split the mega-screen by **what you came to do**, not by entity.

```
/login  /forgot-password  /activate/:code  /change-password

/                         Dashboard ("what needs me")
/translate                Translator workspace (language-first)
/translate/:appId

/apps                     Applications list           (Developer, Admin)
/apps/:appId              Overview: languages, progress, health
/apps/:appId/keys         Key management: add, delete, screenshot, notes
/apps/:appId/groups       Manage + arrange groups
/apps/:appId/releases     Releases & publishing
/apps/:appId/import       Import wizard
/apps/:appId/settings     Name, sections, type, lock

/users                    Users & roles               (Admin)
/profile                  Me: password, notifications, theme, languages
```

Keep the legacy habit of **URL as state** (`?lang=vi&section=12&status=new&q=`) — it is the one thing the old app got right; links are shareable.

---

## 3. Screen-by-screen UI

### 3.1 Translator workspace — the centre of gravity

This is where 90% of the hours are spent. Three panes:

```
┌────────────┬────────────────────────────────────────┬───────────────┐
│ SCOPE      │ STRINGS                                │ CONTEXT       │
│            │ ┌────────────────────────────────────┐ │               │
│ Language   │ │ [status] login.title               │ │ Screenshot    │
│ Vietnamese │ │ EN  Sign in to Localizer      [copy]│ │ [preview]    │
│ 62% ▓▓▓░░  │ │ VI  [ Đăng nhập Localizer     ]    │ │               │
│            │ ├────────────────────────────────────┤ │ Notes         │
│ + App A 12 │ │ ...                                │ │ History       │
│    Login 3 │ │                                    │ │ Placeholders  │
│    Home  9 │ └────────────────────────────────────┘ │ {name} ok     │
│ + App B  0 │ [All] [New 12] [Updated 4] [Ignored]   │ Comments (2)  │
└────────────┴────────────────────────────────────────┴───────────────┘
```

- **Language first, app second.** A translator owns a language, not an app. The old app makes you pick app → version → section → language, in that order.
- **Scope tree** replaces radio strip + tabs + toggle: app → section *or* group (a segmented control at the top of the tree, not a page-level mode), each node carrying its outstanding count. `Sidebar` + `Collapsible` + `Badge`.
- **String list is virtualized** (TanStack Virtual) and editable in place: auto-growing `Textarea`, autosave on blur with a debounce, `Ctrl+Enter` copies the source, `Enter` saves and jumps to the next untranslated row, `Ctrl+S` saves all dirty rows. Dirty rows get a marker; a sticky bar shows "3 unsaved — Save all / Discard".
- **Status as filter chips**, not colour-only. Legacy encodes status purely as a background colour class (`new-translation`, `updated-translation`) — unreadable for colour-blind users and invisible in dark mode. Use `Badge` + colour.
- **Context panel** collapses the legacy's scattered popovers (history popover, image drawer, note modal) into one docked panel that follows the selected row.
- **Placeholder check inline** — `{name}` mismatches shown on the row as you type, not only on save.
- **RTL** for Arabic: shadcn has an `rtl` flag in `components.json`; the string editor should flip direction per target language.

### 3.2 Dashboard — new

"What needs me" for every role: outstanding counts per language and app, recently changed source strings, keys missing screenshots, releases waiting to publish, my last edits. `Card` + small tables. Removes the need to hunt through four selectors to find work.

### 3.3 Applications

A real table (not the legacy hand-built `Row`/`Col` grid): name, type badge (Text/File), language progress bars, lock state, ungrouped-count badge, row actions. `Table` + `DropdownMenu` + `Badge`.

### 3.4 Key management (developer view)

Split out of the translator screen entirely. Table of keys with the **English source only**: add key (live duplicate check as today, but as inline form validation), bulk delete, bulk assign to release, attach screenshot, per-key note. Screenshot upload is drag-and-drop with a gallery, not a drawer per section — the brief's UC-D18 already asks for this UI to be redone.

### 3.5 Groups

Keep the dual-pane drag & drop — the one genuinely good interaction in the old app — but with `dnd-kit` (`react-beautiful-dnd` is unmaintained). Add: multi-select drag, search inside each pane, "orphans only" filter, and the orphan badge as a persistent target ("18 ungrouped").

Open question worth settling first: **do we still need Sections and Groups both?** If groups exist to give translators a human-friendly view, consider making groups the only hierarchy and importing section prefixes as the initial grouping. That deletes half the API surface.

### 3.6 Releases & publishing — the biggest redesign opportunity

The brief already points this way: fold `Allow publish` (UC-D04), release version (UC-D05), lock app (UC-D20) and publish-to-env (UC-D22/23) into **one GitHub-style release model**:

```
Draft  ->  Frozen  ->  Published to Dev  ->  Test  ->  Prod
```

- A release is a named set of keys. Drafts are editable; freezing locks them, which replaces the app-wide lock.
- Per-release **readiness view**: language x completion matrix, validation errors blocking publish.
- **Diff before publish**: what changed since the previous release, per language.
- Publish history with who/when/what, and a re-publish or rollback action.
- The three env buttons become one Publish dialog with a target select and a confirmation of what is about to move.

### 3.7 Import / Export

Fix the broken import as a 4-step wizard: drop files → assign a language per file → **preview the diff** (new / changed / unchanged / removed, with the "skip values identical to English" toggle from UC-D08) → confirm. Nothing is written until the preview is accepted.

Export: JSON per language (today), ZIP of all languages, plus CSV/XLSX for agencies working outside the tool. Worth considering: a read-only API token so CI can pull `vi.json` at build time instead of a human downloading it.

### 3.8 Users & roles

`Table` + filter tabs (All / Active / Inactive) + invite `Dialog`. Languages assigned as a multi-select of chips rather than a plain list. Role shown with a permission-matrix preview so an admin can see what they are granting.

### 3.9 Auth & profile

Login, forgot password, activate account, forced first-login password change — a straight port, but as one centred `Card` layout with `react-hook-form` + `zod` validation. Profile gains theme, UI language (the tool itself is English-only today) and notification preferences.

---

## 4. Features worth adding beyond parity

| Idea                             | Why                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------- |
| **Translation memory**           | Same English string already translated elsewhere, so suggest it. Cheap, big win. |
| **Machine-translation pre-fill** | Azure Translator draft with a `Machine` status, human reviews. Speeds the first pass. |
| **Per-key comments**             | Legacy only has section-level notes; a question about one key has nowhere to go. |
| **History & revert**             | History today is a popover with one previous value; make it a real trail.     |
| **Find & replace**               | Terminology changes across a language are currently manual, key by key.       |
| **Validation panel**             | Placeholders, HTML tags, length limits, trailing spaces — blocking publish.   |
| **Keyboard-first editing**       | Enter / Tab / Ctrl+Enter flow; a translator should never need the mouse.      |
| **Bulk actions**                 | Multi-select rows, then ignore / assign release / move to group / delete.     |
| **Activity log**                 | Who published what, and when. Currently invisible.                            |
| **Tool i18n (EN/VI)**            | The team is Vietnamese; the tool is English-only.                             |
| **Dark mode**                    | Already free with the shadcn base.                                            |

---

## 5. Technical direction

Already in place: Vite 8, React 19, TS 6, Tailwind v4, shadcn/ui (Base UI), lucide, sonner, next-themes.

Proposed additions:

| Need         | Choice                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| Routing      | React Router (data router, nested layouts)                               |
| Server state | TanStack Query — caching, optimistic saves, retry for the autosave queue |
| Forms        | react-hook-form + zod                                                    |
| Tables       | TanStack Table + TanStack Virtual                                        |
| Drag & drop  | dnd-kit                                                                  |
| Tool i18n    | i18next                                                                  |
| Mocking      | MSW — the backend may not be ready for all of this                       |

Structure by feature, not by type:

```
src/features/translate/{components,hooks,api,types}
src/features/apps/...
src/features/releases/...
src/shared/{api,auth,ui}
```

Two rules the legacy app broke and we should not:

- **One row editor.** `TranslationRow` is a single component used by the workspace, the search results and the key manager.
- **One permission source.** A `can(user, "app.publish")` map plus a `<Can>` wrapper — never a role id compared inside a render.

---

## 6. Suggested build order

1. **Shell + auth** — routing, layout, login/activate/forgot, RBAC guard, API client, MSW mocks.
2. **Translator workspace** — scope tree, virtualized string list, autosave, status filters, context panel. This alone justifies the rewrite.
3. **Applications + key management** — list, overview, add/edit keys, screenshots, notes.
4. **Groups** — manage and arrange, with dnd-kit.
5. **Releases & publishing** — the new model.
6. **Import wizard + exports.**
7. **Users & admin.**
8. **Extras** — dashboard, translation memory, MT, comments, history.

---

## 7. Open questions to settle before building

1. **Sections vs Groups** — keep both, or collapse into one hierarchy?
2. **PDF / file translations** — still used? If yes, it should be a *mode* of the same screen, not a duplicate 1300-line component.
3. **Publish** — is the backend publish pipeline actually working, and can it accept a release-based model?
4. **`Ignore`** — split into "not translatable" (a key property set by the developer) and "hide from my list" (a translator preference)?
5. **Backend** — are we free to change or extend the API, or is this redesign frontend-only against the existing endpoints?
6. **Languages** — still the hardcoded 11, or admin-managed?
