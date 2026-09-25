/**
 * The localization domain model — types and the pure rules over them.
 *
 * This module has no I/O and no browser API in it, on purpose: the mock
 * backend in `src/mock/` imports it directly, so status, key format and group
 * extraction are defined once and the two sides cannot drift. Data itself
 * arrives over HTTP — see `lib/api.ts` for the client and `src/mock/router.ts`
 * for the stand-in backend that answers it.
 */

export type LanguageCode =
  | "en"
  | "zh-Hans"
  | "ms"
  | "ja"
  | "ko"
  | "ru"
  | "vi"
  | "mn"
  | "es"
  | "ar-SA"
  | "th"
  | "my"
  | "km"

export type Language = {
  code: LanguageCode
  name: string
  rtl?: boolean
}

export const SOURCE_LANGUAGE: LanguageCode = "en"

/**
 * Static for now. The legacy backend served this from `Admin/Languages`; when
 * the real one does too, this becomes a fetch and the rest of the module is
 * unaffected.
 */
export const languages: Language[] = [
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "Chinese (Simplified)" },
  { code: "ms", name: "Malay" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ru", name: "Russian" },
  { code: "vi", name: "Vietnamese" },
  { code: "mn", name: "Mongolian" },
  { code: "es", name: "Spanish" },
  { code: "ar-SA", name: "Arabic", rtl: true },
  { code: "th", name: "Thai" },
  { code: "my", name: "Burmese" },
  { code: "km", name: "Khmer" },
]

/** `{ vi: "Vietnamese", … }` — what a select shows for its value. */
export const languageNames: Record<string, string> = Object.fromEntries(
  languages.map((item) => [item.code, item.name])
)

/** One language file: `{ "group.sub.key": "value", … }`. */
export type LocaleBundle = Record<string, string>

/** `import` — came from the bundle import. `manual` — added in the UI. */
export type KeyOrigin = "import" | "manual"

/**
 * `missing` — the target bundle has nothing usable for this key. Three cases,
 * all the same thing to a translator:
 *   1. the key is absent from the target bundle,
 *   2. its value is empty,
 *   3. its value is a verbatim copy of the English source.
 *
 * Case 3 counts because the bundles are exported with English as the fallback
 * for untranslated strings (legacy UC-T11), so a copy is an untranslated
 * string wearing the source's clothes. The rule is skipped when the target
 * language *is* English, where matching the source is the point.
 *
 * `translated` — anything else. Whether the value is any *good* is the job of
 * `lib/validation.ts`.
 */
export type TranslationStatus = "translated" | "missing"

/**
 * Who did something, and when — `{ by: "Irene Do", at: "2026-03-02T07:11:00Z" }`.
 *
 * `at` is an ISO 8601 instant; the screen decides how to read it out.
 */
export type AuditStamp = {
  by: string
  at: string
}

/** The author recorded for text that arrived with a bundle import. */
export const IMPORT_AUTHOR = "Bundle import"

export type TranslationRow = {
  key: string
  /** First dot-segment of the key. */
  group: string
  source: string
  target: string
  status: TranslationStatus
  origin: KeyOrigin
  /** Who put the key in the registry, and when — the same in every language. */
  created: AuditStamp
  /**
   * Who last wrote *this language's* value, and when. Absent while the value
   * is empty, because nobody has written one yet.
   *
   * Values that came in with the import predate the trail, so they are stamped
   * with the import rather than left blank: "nobody has touched it" and "we
   * have no record" are different answers to a reviewer.
   */
  updated?: AuditStamp
}

export function groupKeyOf(key: string) {
  const dot = key.indexOf(".")
  return dot === -1 ? key : key.slice(0, dot)
}

/**
 * `school_admin/campus_admin.inviteadmin.text`,
 * `invitation-registernew.policy.accept` and `common.link.repOnline` are all
 * real keys in the export, so `/`, `-` and camelCase are allowed — 434 of the
 * 3,339 seeded keys carry a capital, and rejecting them would have meant the
 * app refusing to create or import a name 13% of its own data already uses.
 *
 * A leading dot, an empty segment and a space are still out, and at least one
 * dot is required because the first segment is the group.
 */
export const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_/-]*(\.[A-Za-z0-9_/-]+)+$/

export function isValidKey(key: string) {
  return KEY_PATTERN.test(key)
}

/** The single definition of status — see `TranslationStatus`. */
export function statusOf(
  source: string,
  target: string | undefined,
  language: LanguageCode = SOURCE_LANGUAGE
): TranslationStatus {
  if (target === undefined || target === "") {
    return "missing"
  }
  if (language !== SOURCE_LANGUAGE && target === source) {
    return "missing"
  }
  return "translated"
}

export type GroupOption = {
  group: string
  total: number
  outstanding: number
}

export function groupOptionsOf(rows: TranslationRow[]): GroupOption[] {
  const byGroup = new Map<string, GroupOption>()

  for (const row of rows) {
    let option = byGroup.get(row.group)
    if (!option) {
      option = { group: row.group, total: 0, outstanding: 0 }
      byGroup.set(row.group, option)
    }
    option.total += 1
    if (row.status === "missing") {
      option.outstanding += 1
    }
  }

  return [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group))
}
