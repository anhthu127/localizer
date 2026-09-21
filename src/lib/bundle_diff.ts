/**
 * Reading an uploaded language file, and working out what importing it would
 * change.
 *
 * Pure, and deliberately separate from the dialog that shows it: the preview
 * the reviewer accepts and the write the server performs have to agree about
 * what "replace" means, so the rule is written once here and once in
 * `src/mock/store.ts` against the same vocabulary — nothing is written until
 * the preview is accepted (see `docs/redesign_brief.md`, §3.7).
 *
 * A file may hold keys the registry has never heard of. Importing registers
 * them — `new` in the diff below — against the value the file carries, giving
 * every other language the same key and no text, exactly as `createKey` does.
 * A key whose name the registry cannot accept is the one thing still skipped,
 * and it is named rather than dropped quietly.
 */

import type { ImportMode } from "@/lib/api_types"
import {
  groupKeyOf,
  isValidKey,
  SOURCE_LANGUAGE,
  type LanguageCode,
  type LocaleBundle,
  type TranslationRow,
} from "@/lib/locale_data"
import { checkTranslation, type RowIssue } from "@/lib/validation"

/** A file that is not a language file at all — the message is shown as typed. */
export class BundleFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BundleFileError"
  }
}

/**
 * `new` — the registry does not define this key; importing registers it.
 * `added` — the key is defined, held nothing, and the file brings text.
 * `changed` — both sides have text and they differ.
 * `removed` — there was text, and importing takes it away.
 * `unchanged` — the file agrees with what is already stored.
 */
export type DiffKind = "new" | "added" | "changed" | "removed" | "unchanged"

export type DiffEntry = {
  key: string
  /** First dot-segment. The preview groups by it, one card per group. */
  group: string
  kind: DiffKind
  /** What this language holds today. */
  before: string
  /** What it would hold after the import. */
  after: string
  /** The English, for a reviewer reading the two values side by side. */
  source: string
  /** What the checks say about `after` — an import can introduce them too. */
  issues: RowIssue[]
}

export type DiffCounts = Record<DiffKind, number>

export type BundleDiff = {
  entries: DiffEntry[]
  counts: DiffCounts
  /** Keys whose names the registry cannot accept — see `KEY_PATTERN`. Skipped. */
  invalid: string[]
  /** Entries whose new value a check would flag as an error. */
  errors: number
}

/** Everything the import would actually write. */
export const CHANGED_KINDS: DiffKind[] = ["new", "added", "changed", "removed"]

/**
 * A language file, read off disk.
 *
 * The stored bundles are flat — `"nav.home": "Trang chủ"` — but a file exported
 * from somewhere else may nest the segments instead, so nested objects are
 * flattened back onto dotted keys rather than rejected. Numbers and booleans
 * are read as their text; anything else is a shape this app cannot store, and
 * the key that carries it is named.
 */
export function parseBundleFile(text: string): LocaleBundle {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new BundleFileError(
      `That file is not valid JSON — ${cause instanceof Error ? cause.message : String(cause)}`
    )
  }

  if (!isPlainObject(parsed)) {
    throw new BundleFileError(
      "A language file is a JSON object of key: text pairs."
    )
  }

  const values: LocaleBundle = {}
  flatten(parsed, "", values)

  if (Object.keys(values).length === 0) {
    throw new BundleFileError("That file holds no keys.")
  }

  return values
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function flatten(
  node: Record<string, unknown>,
  prefix: string,
  out: LocaleBundle
) {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name

    if (typeof value === "string") {
      out[key] = value
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value)
    } else if (value === null) {
      out[key] = ""
    } else if (isPlainObject(value)) {
      flatten(value, key, out)
    } else {
      throw new BundleFileError(
        `"${key}" holds a ${Array.isArray(value) ? "list" : typeof value} — every value has to be text.`
      )
    }
  }
}

type DiffOptions = {
  mode: ImportMode
  language: LanguageCode
  /** From the target's profile, for the length checks — see `target_profiles.ts`. */
  lengthBudget: number
  maxLength?: number
}

/**
 * The preview: every key this app defines, what the file would do to it, and
 * the keys the file would add to the registry.
 *
 * `replace` is the honest reading of "the file becomes this language" — a key
 * the file leaves out loses its value, and the diff says so in red rather than
 * letting it happen quietly. `merge` leaves those keys alone, which is what a
 * partial file from an agency usually means. Neither mode touches a key the
 * file does not name: `replace` empties what this app already defines, it does
 * not un-register it.
 *
 * Registry order first, then the file's own order for what it brings — so the
 * preview reads like the file does, and the keys that did not exist a moment
 * ago are together at the end of their group.
 */
export function diffBundle(
  rows: TranslationRow[],
  incoming: LocaleBundle,
  { mode, language, lengthBudget, maxLength }: DiffOptions
): BundleDiff {
  const counts: DiffCounts = {
    new: 0,
    added: 0,
    changed: 0,
    removed: 0,
    unchanged: 0,
  }
  const entries: DiffEntry[] = []
  let errors = 0

  for (const row of rows) {
    const before = row.target
    const has = Object.hasOwn(incoming, row.key)
    const after = has ? incoming[row.key] : mode === "replace" ? "" : before

    const kind: DiffKind =
      after === before
        ? "unchanged"
        : before === ""
          ? "added"
          : after === ""
            ? "removed"
            : "changed"

    counts[kind] += 1

    // Only for values the import would write: running the checks over three
    // thousand untouched rows costs the preview its responsiveness and tells
    // the reviewer nothing about this file.
    const issues =
      kind === "added" || kind === "changed"
        ? checkTranslation(row.source, after, {
            language,
            lengthBudget,
            maxLength,
          })
        : []

    if (issues.some((issue) => issue.level === "error")) {
      errors += 1
    }

    entries.push({
      key: row.key,
      group: row.group,
      kind,
      before,
      after,
      source: row.source,
      issues,
    })
  }

  const known = new Set(rows.map((row) => row.key))
  const invalid: string[] = []

  // A key the file brings and the registry does not hold. Importing creates
  // it, so it is a change to preview rather than a line in a footnote — but
  // only if the registry can hold its name at all.
  for (const [key, after] of Object.entries(incoming)) {
    if (known.has(key)) {
      continue
    }

    if (!isValidKey(key)) {
      invalid.push(key)
      continue
    }

    // The file is the only thing that knows this key, so it is also the only
    // source of English there is: an `en.json` brings one, every other file
    // registers the key with none and reads as missing in English.
    const source = language === SOURCE_LANGUAGE ? after : ""

    // An empty source makes `checkTranslation` a no-op, which is the honest
    // answer — there is nothing to check a first translation against.
    const issues = checkTranslation(source, after, {
      language,
      lengthBudget,
      maxLength,
    })

    if (issues.some((issue) => issue.level === "error")) {
      errors += 1
    }

    counts.new += 1

    entries.push({
      key,
      group: groupKeyOf(key),
      kind: "new",
      before: "",
      after,
      source,
      issues,
    })
  }

  return { entries, counts, invalid, errors }
}

/** How many keys the import would actually write. */
export function changeCount(counts: DiffCounts): number {
  return counts.new + counts.added + counts.changed + counts.removed
}
