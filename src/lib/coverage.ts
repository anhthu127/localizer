/**
 * Derivations over `GET /api/coverage`. The counting happens on the server —
 * these are the three sums the dashboard shows on top of it.
 */

import type { CoverageResponse, LanguageCoverage } from "@/lib/api_types"
import type { LanguageCode } from "@/lib/locale_data"

export function coverageOf(
  coverage: CoverageResponse | null,
  code: LanguageCode
): LanguageCoverage | null {
  return coverage?.languages.find((entry) => entry.code === code) ?? null
}

export function percentOf(entry: LanguageCoverage, sourceKeyCount: number) {
  return sourceKeyCount
    ? Math.round((entry.translated / sourceKeyCount) * 100)
    : 0
}

export function issueCountOf(entry: LanguageCoverage) {
  return entry.issues.placeholder + entry.issues.whitespace + entry.issues.script
}

/** Missing plus flagged, across every language — the real size of the queue. */
export function totalNeedsReview(coverage: CoverageResponse) {
  return coverage.languages.reduce(
    (sum, entry) => sum + entry.missing + issueCountOf(entry),
    0
  )
}
