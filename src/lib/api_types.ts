/**
 * The HTTP contract between the app and the localization service.
 *
 * Both sides import this file: `lib/api.ts` in the browser and
 * `server/mock_api.ts` in Node. When the real backend arrives, this is the
 * document to hand its author — and the only file that has to change if their
 * shapes differ.
 */

import type {
  KeyOrigin,
  LanguageCode,
  TranslationRow,
} from "./locale_data.ts"

/** A key in the registry — `server-data/keys.json`, one row of it. */
export type KeyRecord = {
  key: string
  /** First dot-segment, denormalized so a list can group without parsing. */
  group: string
  /** The menu target that owns it — `web/school`. */
  target: string
  origin: KeyOrigin
  createdAt: string
}

/** `GET /api/entries?target=&lang=` — one app's keys, status included. */
export type EntriesResponse = {
  target: string
  language: LanguageCode
  sourceLanguage: LanguageCode
  entries: TranslationRow[]
}

/** `POST /api/keys` */
export type CreateKeyRequest = {
  key: string
  /** English text. Every other language is created empty. */
  source: string
  /** The app the key belongs to; it is created for that app only. */
  target: string
}

export type CreateKeyResponse = {
  key: KeyRecord
  /** Language codes the key was written to — the fan-out, confirmed. */
  languages: LanguageCode[]
}

/** `PUT /api/translations/:lang?target=` */
export type SaveTranslationsRequest = {
  values: Record<string, string>
}

export type SaveTranslationsResponse = {
  saved: number
  /** Where the server wrote them, so the UI can say so. */
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

export type ApiErrorBody = {
  error: string
}
