# Domain

The words below are the ones the code uses. Where a term has a definition in
code, that definition wins and is named here so you can open it directly.

## Target (also: app)

One application that ships strings — `web/school`, `app/parent`,
`others/email`. Ten of them, listed in `config/nav_items.ts` and profiled in
`config/target_profiles.ts`. The path is also the route: `/{section}/{leaf}`.

**A target is a key namespace.** `web/school` and `app/parent` may both define
`nav.home` and mean different things, so the value files are nested per target
and every key-bearing API route takes `?target=`. There is no global key list.

A target has a **content kind** — `ui`, `email`, `sms` or `notification` — and
that, not its section, decides which screen renders it.

## Key

A dotted identifier: `nav.home`, `invitation-registernew.policy.accept`,
`common.link.repOnline`. Letters, digits, `_`, `/` and `-`; at least one dot
required, because the first segment is the group. The format is `KEY_PATTERN` /
`isValidKey` in `lib/locale_data.ts` — the one definition.

**Case is not a rule.** 434 of the 3,339 seeded keys are camelCase, so a
lowercase-only pattern would have had the app refusing to create or import a
name 13% of its own data already uses — and `seed()` does not validate, so
those keys were in the registry either way.

**Group** is the first dot-segment (`groupKeyOf`), denormalised onto each key
record so a list can group without parsing. It is what the group filter filters
and what the dashboard's gaps card counts.

**Origin** is `import` (arrived with a bundle) or `manual` (added in the UI).

## Delete scope — `DeleteScope`

Deleting keys asks one question, and it is not "are you sure": how far does it
go. `lib/api_types.ts` names the two answers, and `POST /api/keys/delete` takes
one of them with a list of keys — a row's trash button sends a list of one.

- **`language`** — the values leave one language file and its audit log. The
  keys stay in `keys.json`, so they read as _missing_ in that language and keep
  their text in the other twelve. A translator's cleanup.
- **`all`** — the keys leave `keys.json` and every language file of the app.
  The string is retired from the product.

The scope never crosses apps: a key deleted from `app/parent` is untouched in
`app/student`, the same way `createKey` only ever fans out within one target.

## Bundle

One language file for one target: `{ "key": "text" }`, flat, one level.
On disk: `server-data/translations/<target>/<code>.json`.

**English is not special.** `en.json` is a language file like any other, and the
key registry holds no text at all. Adding a key writes the English string to
`en.json`, an empty string to the other twelve files, and one row to
`keys.json` — which is why a new key is _missing_ in every language at once, in
that target only.

## Language

Thirteen, fixed in `lib/locale_data.ts`: en, zh-Hans, ms, ja, ko, ru, vi, mn,
es, ar-SA (RTL), th, my, km. `SOURCE_LANGUAGE` is `en`. The list is static
because the legacy backend served it from `Admin/Languages` and the real one
will again; when it does, that constant becomes a fetch and nothing else moves.

## Status — `statusOf`

Two values, and one definition, in `lib/locale_data.ts`:

- **missing** — the key is absent from the target bundle, _or_ its value is
  empty, _or_ its value is a verbatim copy of the English source. The third case
  counts because bundles ship with English as the fallback, so a copy is an
  untranslated string wearing the source's clothes. It is skipped when the
  target language _is_ English.
- **translated** — anything else. Whether the value is any _good_ is
  `lib/validation.ts`, not this.

`src/mock/store.ts` imports `statusOf`; it does not reimplement it.

## Issues — `checkTranslation`

Per-row checks over a _translated_ value, in `lib/validation.ts`, each an
`error` or a `warning`: placeholder drift (`{firstName}` becoming
`{studentName}`), dominant-script mismatch (a bundle holding the wrong language
entirely), whitespace, unbalanced HTML in a mail body, and links that no longer
match the English ones. Checks are skipped for very short English sources, where
they fire often and say little.

"Needs review" on the dashboard means _missing, or translated and flagged_.

## Audit

`AuditStamp` is `{ by, at }`. A key carries `created` — the same in every
language — and each value carries `updated`, kept beside the bundle in
`server-data/audit/<target>/<code>.json` so the bundle stays a plain
`key: text` document that can be shipped as-is. Text that arrived with an import
is stamped `IMPORT_AUTHOR`, because "nobody has touched it" and "we have no
record" are different answers to a reviewer.

## Template

The three `others/*` targets hold **message templates** rather than loose UI
strings — an invitation mail, a reminder SMS, a push notification.

**A template is not a fourth kind of storage.** Its text is ordinary keys in
that channel's bundle, one per field: `invite_coach.subject`,
`invite_coach.body`, `invite_coach.cta`. So status, validation, saving, export
and coverage all work on it unchanged, and the translate dialog saves through
`PUT /api/translations/:lang` like every other screen.

- **Channel** — `email`, `sms`, `notification`. Its **field schema** is
  `channelFields` in `lib/template_data.ts`, shared with the server.
- `templates.json` holds only what a key cannot carry: name, **category** (who
  receives it), **owner** (which product sends it), and who created it.
- **Category** and **owner** are labels on the template, not on the keys.

The mail body is rich text. Both the editor's output and the preview's input go
through the whitelist in `lib/template_preview.ts` — the editor _unwraps_ what
it does not know, because that markup came from the browser; the preview
_escapes_ it, because that markup came from a bundle and a translator should see
the `<script>` they are about to ship. Nothing else is handed to
`dangerouslySetInnerHTML`.

## Import and export

**Import** takes one whole language file for one target, in one of two modes
(`ImportMode`): `replace` — the language becomes the file, so an omitted key
loses its value; `merge` — an omitted key keeps what it had, which is what a
partial file from an agency usually means. `merge` is the default. The wizard
previews the diff (`lib/bundle_diff.ts`) before it applies.

A `replace` also **retires** keys, and that part is the wizard's, not the
route's. `PUT /api/import/:lang` never un-registers anything, because one
language file cannot say which keys an app has. A whole delivery can: once
every file has landed, `pages/import_page.tsx` deletes the keys that _no_ file
in the batch carried, through `POST /api/keys/delete` with `scope: "all"` —
see [Delete scope](#delete-scope--deletescope). Per file it would be wrong:
`vi.json` omitting a key would unregister it, and the `ja.json` behind it would
register it again as new, with its English gone.

**Export** is a POST, because the caller names every file in the archive: the
receiving application decides what its locale files are called, so `zh-Hans`
here may have to arrive as `zh_CN.json`, and a Flutter app wants `.arb`.
`includeUntranslated: false` drops the keys `statusOf` calls missing, which is
what a runtime bundle wants — the key is absent, so the app falls back to
English by itself.

## Deliberately broken sample data

Two rows in the seed are wrong on purpose, so the review counts have something
to find: `visitation_scheduled` is missing a `</p>` in Vietnamese, and
`push_story_ready` translates `{firstName}` as `{studentName}`. `ms.json` holds
Chinese. Do not "fix" these.
