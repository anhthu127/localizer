# Target consumer apps — UI deep dive

Date: 2026-09-18
Scope: what each of the ten menu targets actually is, and how the translation workspace must differ per target.
Supersedes: the release/version parts of [`redesign_brief.md`](./redesign_brief.md) §3.6 and the status model in [`progress_report.md`](./progress_report.md) §4.

---

## 0. Two things dropped from scope

| Dropped | Was | Now |
| --- | --- | --- |
| **Version tag** | A release `Select` in the workspace toolbar and a release `Badge` on every row, fed by `src/mock/release_assignment.ts` | Gone. The filter, the badge, the field on `TranslationRow` and the mock file are all removed. |
| **"Same as English" status** | A third status, derived by comparing the target value to the English value | Gone. Status is `missing` or `translated`. A key present in the target bundle counts as translated. |

Dropping "same as English" has one consequence worth stating plainly: with the current sample files
every language lands at **99.9%** (3,336 of 3,339 keys present), because the bundles were exported with
English as the fallback for untranslated strings — legacy UC-T11 does exactly that. Coverage stops
being a useful signal until the backend supplies the real per-key lifecycle (`New` → `Updated` →
`Published`), which the JSON bundles do not carry. §4 proposes what fills that gap in the meantime.

---

## 1. What a "target" is

Ten targets in three sections. In the legacy model each is an **Application** — its own key namespace,
its own sections, its own import, its own publish. They are not views on one bundle.

| Section | Targets |
| --- | --- |
| Web | School, Curriculum, Training, Content |
| App | Baby, Parent, Student |
| Others | Mail invite user, SMS invite user, Mail notification |

The important structural point: **"Others" are not apps.** They are message templates. A translator
working on "SMS invite user" is not translating a UI — they are writing a message that has to fit a
segment budget, and the three-pane, 3,000-row workspace is the wrong tool for it. That is the single
biggest per-target difference in this document.

---

## 2. The one dataset we actually have is the School web app

`sample-data/locale/*.json` is **one** application's bundle, not ten. The group keys say which:

| Evidence | Reading |
| --- | --- |
| `cims.*` — 204 keys, the largest group | CIMS, the school/campus management system |
| `school`, `schools`, `campus`, `campus_editing`, `campus_order`, `region`, `regions` | Org hierarchy: region → school → campus |
| `class`, `class_editing`, `class_adding`, `class_teacher`, `class_license`, `class_unitplan` | Class administration |
| `student`, `movepromotestudents`, `managestudentlogin`, `student_subscription` | Student records |
| `visitation`, `visitation_request`, `coach`, `school_trainer`, `region_trainer` | Coaching / visitation workflow |
| `invitation*` (176 keys plus 9 sibling groups), `registration`, `users`, `license*` | Onboarding and licensing |

So the measured profile below is **School's**. The other nine targets have no source bundle in this
repo; their profiles in §6 are marked as inferred, each with the question that settles it.

---

## 3. School — the measured profile

### Volume and shape

| Measure | Value |
| --- | --- |
| Source keys | 3,339 |
| Group keys (first dot-segment) | 156 |
| Key depth | 2,598 at 3 segments, 350 at 2, 305 at 4, 84 at 5–6 |
| Group size spread | `cims` 204 … 44 groups hold a single key |

**UI consequence.** 156 groups is past the point where a plain `Select` works — it is already a
searchable combobox, correctly. But the long tail (44 single-key groups) means the group filter is
not a navigation tree; it is a *filter*. The scope tree from the brief should collapse that tail into
an "Other (44)" node rather than render 156 siblings.

### String shapes

| Measure | Value |
| --- | --- |
| Median length | 14 characters |
| p90 / p99 / max | 52 / 128 / 296 |
| Single-word values | 1,118 (33%) |
| Values ≥ 60 characters | 257 (8%) |
| Values with HTML-ish tags | 3 (`<email>`, `<linkView>`, `<linkApprove>`) |

**UI consequence.** Two thirds of the work is short labels. The current row gives every string a
`min-h-16` resizable `Textarea` — four lines of chrome for a value like `"Save"`. The editor should
size itself to the source: a single-line `Input` under ~60 characters, a growing `Textarea` above it.
That roughly triples the rows visible per screen in the common case.

### Placeholders

Curly-brace only: `{name}` ×22, `{link}` ×14, `{resource}` ×11, `{count}` ×10, `{classname}` ×10,
`{email}` ×9, `{0}` ×8. No `%s`, no `${}`, no ICU plural syntax.

Plurals are instead encoded as **separate key variants** — `class_unitplan.generate.error`,
`.errorSS`, `.errorSM`, `.errorMS`, `.errorMM` (singular/plural for two counts, 7 keys in total). A
translator sees five near-identical 290-character strings with no indication they are one message.

**UI consequence.** Placeholder validation is a hard requirement (legacy UC-T05 already asks for it),
and it is cheap here because there is exactly one syntax. Variant keys should be grouped visually —
same base key, rendered as one card with the variants stacked — so the translator sees the pattern.

### Repetition

2,186 distinct English values across 3,339 keys. **1,602 keys (48%) share their English string with
at least one other key**: `"Name"` ×35, `"Email"` ×31, `"Campus"` ×30, `"Class"` ×26, `"Cancel"` ×22,
`"Save"` ×21.

**UI consequence.** Translation memory is not a nice-to-have on this dataset, it is half the work.
An exact-match suggestion from another key in the same bundle would pre-fill roughly 1,600 rows.

### Length expansion by language

Ratio of translated length to English length, over keys that are actually translated:

| Language | Median | p90 | > 1.4× | > 2× |
| --- | --- | --- | --- | --- |
| Russian | 1.16 | 1.92 | 801 | 235 |
| Mongolian | 1.13 | 1.91 | 789 | 237 |
| Vietnamese | 1.05 | 1.75 | 397 | 105 |
| Thai | 1.00 | 1.54 | 339 | 39 |
| Japanese | 0.50 | 0.82 | 22 | 6 |
| Korean | 0.50 | 0.80 | 28 | 8 |

**UI consequence.** Russian and Mongolian routinely double the English length; on a fixed-width button
or a table column header that is a layout break, not a translation problem. The row needs a **length
budget meter** — character count against the source length, warning past ~1.5× for keys in
label-shaped groups (`*.col_*`, `*.label`, `*.button`, `*.heading`, single-word sources). Japanese and
Korean halve it, which is a different risk: a Japanese label may read as truncated when it is correct.

---

## 4. Data-quality findings that the UI has to surface

These came out of the same pass, and they change what the workspace needs — because with "same as
English" gone, there is no other automatic signal that a translation is wrong.

### 4.1 `ms.json` and `zh-Hans.json` are mislabelled

| File | Declared | Actual content |
| --- | --- | --- |
| `ms.json` (Malay) | Malay | **Chinese** — 3,087 of 3,338 values contain CJK characters |
| `zh-Hans.json` (Chinese) | Chinese | **English** — 1 value in the whole file contains a CJK character |

Malay currently reports 92.5% coverage. It has no Malay in it. Under the old status model this was
invisible (the values differ from English, so they counted as translated); under the new one it is
equally invisible. Only a script check catches it.

**UI consequence.** A **script-match validation** per language: flag a value whose dominant script is
not the one the target language expects. Cheap to implement — one Unicode range per language — and it
is the only automatic quality signal left once value-comparison is gone. Expected ranges, measured
against the bundles that *are* correct: Cyrillic for `ru` / `mn`, Hangul for `ko`, Kana + CJK for `ja`,
Thai for `th`, CJK for `zh-Hans`, Latin for `vi` / `ms` / `es`, Arabic for `ar-SA`.

### 4.2 Trailing and leading whitespace

Translated values whose surrounding whitespace does not match the English source:

| Language | Count |
| --- | --- |
| Mongolian | 716 |
| Russian | 196 |
| Korean | 96 |
| Vietnamese | 11 |
| Thai | 10 |

Mongolian carries a trailing space on roughly a quarter of its strings (`"Менежер "`). Concatenated
into a sentence or centred in a button, that shifts alignment.

**UI consequence.** Whitespace diff shown inline on the row with a one-click trim — not a blocking
error, a fixable warning.

### 4.3 Placeholder mismatches

Russian 10, Malay 3, Vietnamese 2, Mongolian 2, Japanese 1, Korean 1. Small in absolute terms, but each
one is a runtime break in the consumer app.

**UI consequence.** Blocking, per legacy UC-T05 — this is the one validation that should prevent a save.

### 4.4 Three keys missing everywhere

All twelve target bundles are missing the same 3 keys present in `en.json`, and each carries 1–2 keys
English does not. That is an export-pipeline artifact, not translator work; it belongs on the target
overview, not mixed into a translator's outstanding list.

---

## 5. Three content kinds, three workspaces

The ten targets fall into three kinds. This axis drives UI more than Web / App / Others does.

| | **UI strings** | **Email template** | **SMS template** |
| --- | --- | --- | --- |
| Targets | School, Curriculum, Training, Content, Baby, Parent, Student | Mail invite user, Mail notification | SMS invite user |
| Expected volume | hundreds – thousands of keys | tens of keys, each large | tens of keys, each tiny |
| Value shape | labels, short sentences | subject line plus multi-paragraph HTML body | one or two sentences |
| Right layout | dense virtualized two-column grid | subject field + body editor + **rendered preview pane** | single-line input + **segment meter** |
| Editor control | `Input` under 60 chars, growing `Textarea` above | full-height editor, monospace toggle for HTML | `Input`, no wrapping |
| Primary validation | placeholders, length budget, script | placeholders, HTML tag balance, link integrity | **encoding and segment count**, placeholders |
| Context needed | screenshot of the screen the key appears on | the whole rendered email | the phone's message bubble |
| Virtualization | required | pointless | pointless |

### 5.1 The SMS case, in detail

This is where a generic grid fails hardest, and it is worth spelling out, because the numbers are
brutal for exactly the languages this product ships.

An SMS segment is **160 characters in GSM-7**, but **70 characters in UCS-2**. Any character outside the
GSM-7 set forces the entire message to UCS-2. Of the twelve target languages, **nine** force UCS-2 on
every message: Chinese, Japanese, Korean, Russian, Mongolian, Arabic, Thai, Burmese and Khmer.
Vietnamese forces it too, as soon as a single diacritic beyond the GSM-7 Latin subset appears — which
is essentially always. Only English, Malay and Spanish stay in GSM-7, and Spanish only until the
first `¿`.

So: an English invite SMS of 150 characters is one segment. The same message in Vietnamese, at the
measured 1.05× median expansion, is roughly 158 characters in UCS-2 — **three segments**, three times
the send cost, with a real chance of out-of-order delivery on concatenation.

**UI consequence.** The SMS workspace needs, per row, a live meter reading
`encoding · characters · segments` that recomputes as the translator types, turns amber in the last
10 characters of a segment, and shows the source's own segment count beside it as the target. This is
not a nice-to-have; without it nobody discovers the cost until the invoice.

### 5.2 The email case, in detail

The legacy system handled long-form content by attaching **PDF files** to keys (legacy UC-T12–T14, the
1,313-line `PdfTranslations` screen). The brief already proposes killing that duplicate screen. An
email template is the same problem, better solved: a key whose value is long HTML, not a file.

**UI consequence.** Editor and preview side by side, with the preview rendering the same
placeholder-substituted HTML the consumer app sends, plus a tag-balance check. Text direction flips
for Arabic in the preview too, not only in the editor — an RTL email with LTR-laid-out blocks is the
usual way this ships broken.

---

## 6. Per-target profiles

Measured = derived from `sample-data`. Inferred = read from the target name, the nav tree and the
legacy brief; each carries the question that settles it.

### Web

**School** — *measured*. Content kind: UI strings. Audience: school and campus administrators, regional
coaches, internal staff. 3,339 keys across 156 groups. Dense admin UI: tables, column headers, filter
labels, confirmation dialogs, validation messages. Heavy domain jargon (`unitplan`, `visitation`,
`campus`, `license`, `redeem`) that a translator cannot guess from the string alone — **this target
needs a glossary more than any other**. Highest duplicate rate, so the biggest translation-memory win.

**Curriculum** — *inferred*. Content kind: UI strings. Audience: teachers and curriculum staff. Expect
unit / lesson / playlist vocabulary; the School bundle's `unitplanmanager`, `class_unitplan`,
`playlists`, `teaching` and `resource` groups are the same domain seen from the admin side, so
terminology has to agree across the two targets. *Settles it: is Curriculum a separate application in
the backend, or a section of School?*

**Training** — *inferred*. Content kind: UI strings. Audience: teacher trainers and trainees. The School
bundle already carries `school_trainer`, `region_trainer`, `coach` and `resource.text.training`, which
suggests Training is a sibling app sharing the coaching vocabulary. Expect a smaller bundle with more
long-form instructional copy than School. *Settles it: same question as Curriculum.*

**Content** — *inferred*. Content kind: UI strings, possibly mixed with file assets. Audience: internal
content editors. Its nav badge (27 outstanding) is the highest in the Web group. If this is where the
legacy system's PDF / file translations live, it is a **fourth content kind** and needs the
file-attachment flow rather than the string grid. *Settles it: does Content hold strings, files, or both?*

### App

**Baby**, **Parent**, **Student** — *inferred*. Content kind: UI strings, mobile. Audience: parents,
students and young children rather than staff — so plain language, no admin jargon, and the shortest
strings in the system. Two differences from the Web targets:

- **Hard width limits.** A phone label that expands 1.9× (Russian, Mongolian p90) truncates. The length
  budget meter from §3 should be *stricter* here, and the screenshot context panel matters more than
  anywhere else, because there is no room to be approximate.
- **Reading age.** Baby is a children's app; its copy is read aloud to or by young learners. That is a
  different register, and a translator switching from School to Baby needs to be told. A per-target
  **tone note** in the workspace header covers it — the legacy equivalent was a section-level note
  buried in a modal (UC-T07).

*Settles them: three separate bundles or one shared mobile bundle? And does Baby have enough strings to
be a target at all, or is it a section of Student?*

### Others

**Mail invite user** — *inferred*. Content kind: email template. The School bundle's `invitation.*` (176
keys) is the *web* side of redeeming an invite; the email that carries the code is this target.
`invitation.subject` = `"Redeem Invitation Code"` is very likely the subject line of exactly this mail.
Expect subject, preheader, greeting, body, CTA button label, footer and legal line, with `{name}`,
`{link}` and `{code}` as placeholders. Preview pane required.

**SMS invite user** — *inferred*. Content kind: SMS template. Its nav badge shows 2 outstanding, which
fits a handful of keys. Everything in §5.1 applies. Of the ten targets this one has the fewest strings
and the most constraint per string.

**Mail notification** — *inferred*. Content kind: email template, with a high number of *variants*. The
School bundle's `notificationcreate.*` (61 keys), `notification*` and `surveyEmail.*` are the admin UI
for composing and reviewing notifications; the templates they produce are this target.
`notificationcreate.description.maxlength` = `"The max length of the description is 4000 characters."`
tells us the body limit the backend enforces — **the editor should show that 4,000-character budget**,
and the translated body has to respect it even when the language expands 1.9×.

*Settles all three: are the Others targets stored as ordinary key/value strings, or as template records
with their own schema?*

---

## 7. What stays the same across all ten

One rule from the brief holds and must not bend per target: **one row editor**. The legacy app grew four
copies because each new content type got its own screen. The kinds in §5 are therefore *variants of one
component*, selected by the target's profile — not three components.

Concretely: `TranslationRow` keeps its single definition and receives the target profile. The profile
decides which editor control it renders and which meters appear beside it. Everything else — the key,
the source, the copy-English action, the dirty marker, the status badge, RTL handling, the save queue —
is shared, and a fix to any of it reaches all ten targets.

Also shared: language selection, group filter, search, the dirty / save bar, and URL-as-state
(`?lang=vi&group=nav`).

---

## 8. What this means for the code

| Change | Where |
| --- | --- |
| Drop `release` from the row model, the filter and the badge; delete the mock | `lib/locale_data.ts`, `pages/translations_page.tsx`, `components/translations/translation_row.tsx`, `mock/release_assignment.ts` |
| Status becomes `missing` \| `translated` | `lib/locale_data.ts`, `scripts/generate_coverage.mjs`, `data/locale_coverage.ts`, dashboard |
| New: a profile per target — content kind, audience, tone note, length policy, expected volume | `config/target_profiles.ts`, beside `nav_items.ts` |
| Workspace reads the profile and renders the matching editor and meters | `pages/translations_page.tsx`, `components/translations/translation_row.tsx` |
| Targets with no source bundle show their profile and an explicit "not imported yet" state instead of School's data | `pages/translations_page.tsx` |
| Script-match, whitespace and placeholder warnings per row | `lib/validation.ts` (new) |

The second-to-last point is deliberate: nine of ten targets have no data, and showing them School's
3,339 keys would be a lie that reads as a working feature. An honest empty state that names what is
missing is more useful, and it puts §6's open questions in the product instead of only in this file.

---

## 9. Open questions, in the order they block work

1. **Is each target a separate backend application** with its own key namespace, or are some of them
   sections of one? This decides whether §6's nine profiles become nine imports or three.
2. **Are the Others targets key/value strings or template records?** If template, they need a schema
   (subject, body, variables) and §5's email / SMS workspaces become primary UI, not a variant.
3. **Does Content hold files?** If yes, that is a fourth content kind, and the legacy PDF flow needs a home.
4. **Which language is `ms.json`?** It contains Chinese. Either the file is mislabelled or the export is
   wrong — and `zh-Hans.json`, which contains English, is the other half of the same swap.
5. **Where does per-key status come from** now that value comparison is gone? Without a backend
   lifecycle field every language reads 99.9% complete and the dashboard has nothing to say.
6. **Is there a glossary?** School's domain vocabulary is not guessable, and it has to stay consistent
   across School, Curriculum and Training.
