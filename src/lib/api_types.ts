/**
 * The HTTP contract between the app and the localization service.
 *
 * Both sides import this file: `lib/api.ts` in the browser and the mock
 * backend in `src/mock/`. When the real backend arrives, this is the
 * document to hand its author — and the only file that has to change if their
 * shapes differ.
 */

import type {
  AuditStamp,
  KeyOrigin,
  LanguageCode,
  TranslationRow,
} from "./locale_data.ts"
import type { TemplateEntry } from "./template_data.ts"

/** A key in the registry — `server-data/keys.json`, one row of it. */
export type KeyRecord = {
  key: string
  /** First dot-segment, denormalized so a list can group without parsing. */
  group: string
  /** The menu target that owns it — `web/school`. */
  target: string
  origin: KeyOrigin
  createdAt: string
  /**
   * Who added it. `IMPORT_AUTHOR` for keys that arrived with a bundle, a
   * person's name for keys added in the app.
   */
  createdBy: string
}

/**
 * Who last wrote each value of one app's language file — the other half of the
 * audit trail, kept beside the bundle rather than inside it so the bundle stays
 * a plain `key: text` document that can be shipped as-is.
 *
 * `server-data/audit/<app>/<code>.json`, keyed the same way the bundle is.
 */
export type AuditLog = Record<string, AuditStamp>

/** `GET /api/entries?target=&lang=` — one app's keys, status included. */
export type EntriesResponse = {
  target: string
  language: LanguageCode
  sourceLanguage: LanguageCode
  entries: TranslationRow[]
}

/**
 * `GET /api/templates?target=&lang=` — one channel's templates, text included.
 *
 * The Others targets hold message templates rather than loose keys, so this is
 * the list screen's request. There is no per-template GET and no per-template
 * PUT: the text is ordinary keys under `<template>.<field>`, so the translate
 * dialog saves through `PUT /api/translations/:lang` like everything else.
 */
export type TemplatesResponse = {
  target: string
  language: LanguageCode
  sourceLanguage: LanguageCode
  templates: TemplateEntry[]
}

/** `POST /api/keys` */
export type CreateKeyRequest = {
  key: string
  /** English text. Every other language is created empty. */
  source: string
  /** The app the key belongs to; it is created for that app only. */
  target: string
  /**
   * Who is adding it, for the audit trail. Sent by the browser only because
   * the mock has no session to read it from — see `config/current_user.ts`.
   */
  createdBy?: string
}

export type CreateKeyResponse = {
  key: KeyRecord
  /** Language codes the key was written to — the fan-out, confirmed. */
  languages: LanguageCode[]
}

/** `PUT /api/translations/:lang?target=` */
export type SaveTranslationsRequest = {
  values: Record<string, string>
  /** Who is saving them, for the audit trail — see `CreateKeyRequest`. */
  by?: string
}

export type SaveTranslationsResponse = {
  saved: number
  /** Where the server wrote them, so the UI can say so. */
  file: string
}

/**
 * What a whole-file import does to the keys the file leaves out.
 *
 * `replace` — the language becomes the file: an omitted key loses its value.
 * `merge` — an omitted key keeps whatever it already had, which is what a
 * partial file from a translation agency usually means.
 */
export type ImportMode = "replace" | "merge"

/** `PUT /api/import/:lang?target=` — one language file, wholesale. */
export type ImportRequest = {
  /** The file's contents, flattened to `key: text` — see `lib/bundle_diff.ts`. */
  values: Record<string, string>
  mode: ImportMode
  /** Who is importing it, for the audit trail — see `CreateKeyRequest`. */
  by?: string
}

/** The same tallies the preview showed, as the server actually applied them. */
export type ImportResponse = {
  /** Keys the file brought that the registry did not hold, now registered. */
  created: number
  added: number
  changed: number
  removed: number
  unchanged: number
  /** Keys whose names the registry cannot accept. Neither written nor created. */
  invalid: string[]
  /** Where the server wrote the file, so the UI can say so. */
  file: string
}

export type ReviewIssues = {
  placeholder: number
  whitespace: number
  script: number
}

export type GroupCoverage = {
  group: string
  /** Missing, or translated but flagged by a check. */
  needsReview: number
  total: number
}

export type LanguageCoverage = {
  code: LanguageCode
  /** Key has a value of its own — see `statusOf`. */
  translated: number
  /** Key absent, empty, or a verbatim copy of the English source. */
  missing: number
  /** Translated values a check flagged. */
  issues: ReviewIssues
  /** The five groups with the most keys needing review. */
  topGroups: GroupCoverage[]
}

/** `GET /api/coverage` — what the dashboard renders. */
export type CoverageResponse = {
  sourceKeyCount: number
  groupCount: number
  /** Least complete first, then most flagged. */
  languages: LanguageCoverage[]
}

/** One file in an export: a language, and what to call its file. */
export type ExportFile = {
  language: LanguageCode
  /** File name inside the archive, extension included — `vi.json`. */
  name: string
}

/**
 * `POST /api/export` — answers with a .zip holding one file per language.
 *
 * A POST rather than a GET because the caller names every file in the
 * archive, and a dozen arbitrary names belong in a body rather than a query
 * string.
 */
export type ExportRequest = {
  target: string
  files: ExportFile[]
  /** Archive name without the extension; the server sanitises it. */
  name: string
  /** Keep the keys `statusOf` calls missing — empty, or still English. */
  includeUntranslated: boolean
}

export type ApiErrorBody = {
  error: string
}
