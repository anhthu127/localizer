/**
 * The mock backend's storage layer: plain JSON files under `server-data/`.
 *
 *   server-data/
 *     keys.json                        the key registry — one row per key
 *     templates.json                   the template registry — one row per template
 *     translations/<app>/<code>.json   one file per app per language
 *
 * A template is not a fourth kind of storage: its text lives in the same
 * per-app language files as everything else, keyed `<template>.<field>`, and
 * `templates.json` holds only what a key cannot carry — the message's name,
 * who receives it, which product sends it. See `src/lib/template_data.ts`.
 *
 * Each app is its own key namespace — `web/school` and `app/parent` can both
 * define `nav.home` and mean different things — so the value files are nested
 * per app rather than pooled. An app with no keys has no folder yet.
 *
 * Seeded from `sample-data/locale/*.json` into `web/school` on first use, so
 * the sample export stays pristine and `npm run mock:reset` (or deleting the
 * folder) puts the demo back to where it started.
 *
 * English is not special: `<app>/en.json` is a language file like any other,
 * and the registry holds no text at all. That is how a real schema would
 * separate a key from its translations, which is the point — the API this
 * backs can be swapped for a real one without the app noticing.
 *
 * Status and validation are imported from `src/lib` rather than restated, so
 * the server and the browser cannot disagree about what "missing" means.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

import type {
  CoverageResponse,
  CreateKeyResponse,
  EntriesResponse,
  GroupCoverage,
  KeyRecord,
  LanguageCoverage,
  ReviewIssues,
  SaveTranslationsResponse,
  TemplatesResponse,
} from "../src/lib/api_types.ts"
import {
  groupKeyOf,
  isValidKey,
  languages,
  SOURCE_LANGUAGE,
  statusOf,
  type LanguageCode,
  type LocaleBundle,
  type TranslationRow,
} from "../src/lib/locale_data.ts"
import { safeEntryName } from "../src/lib/file_name.ts"
import {
  entryOf,
  fieldOf,
  fieldsOf,
  templateKeyOf,
  type TemplateEntry,
  type TemplateFieldId,
  type TemplateRecord,
} from "../src/lib/template_data.ts"
import { checkTranslation } from "../src/lib/validation.ts"

/** The app the sample export belongs to — see `src/config/target_profiles.ts`. */
const SEED_TARGET = "web/school"

/**
 * `sample-data/templates.json`, one of them: a registry row plus the text, so
 * the seed is one readable file per concern rather than a registry and twelve
 * bundles a human has to keep in step by hand.
 */
type TemplateSeed = TemplateRecord & {
  source: Partial<Record<TemplateFieldId, string>>
  translations?: Partial<
    Record<LanguageCode, Partial<Record<TemplateFieldId, string>>>
  >
}

/** Groups shown per language on the dashboard. */
const TOP_GROUPS = 5

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}

export type Store = ReturnType<typeof createStore>

export function createStore(root: string) {
  const dataDir = join(root, "server-data")
  const translationsDir = join(dataDir, "translations")
  const keysFile = join(dataDir, "keys.json")
  const templatesFile = join(dataDir, "templates.json")
  const seedDir = join(root, "sample-data", "locale")
  const templateSeedFile = join(root, "sample-data", "templates.json")

  // Files are the source of truth, but parsing 13 × 200 KB on every request
  // would make the workspace feel like a slideshow. Everything is cached and
  // invalidated on write.
  let keyCache: KeyRecord[] | null = null
  let templateCache: TemplateRecord[] | null = null
  const bundleCache = new Map<string, LocaleBundle>()
  let coverageCache: CoverageResponse | null = null

  const clearCaches = () => {
    keyCache = null
    templateCache = null
    bundleCache.clear()
    coverageCache = null
  }

  const readJson = <T>(file: string): T =>
    JSON.parse(readFileSync(file, "utf8")) as T

  const writeJson = (file: string, value: unknown) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  }

  /** `web/school` + `vi` → `server-data/translations/web/school/vi.json`. */
  const bundleFile = (target: string, code: LanguageCode) =>
    join(translationsDir, ...target.split("/"), `${code}.json`)

  /** The same path as the UI shows it — forward slashes, relative to the repo. */
  const relativeBundlePath = (target: string, code: LanguageCode) =>
    `server-data/translations/${target}/${code}.json`

  function seed() {
    // Always from a clean slate, so a half-written or older layout cannot
    // survive into the new one.
    rmSync(dataDir, { recursive: true, force: true })

    for (const language of languages) {
      const from = join(seedDir, `${language.code}.json`)
      writeJson(
        bundleFile(SEED_TARGET, language.code),
        existsSync(from) ? readJson<LocaleBundle>(from) : {}
      )
    }

    const source = readJson<LocaleBundle>(
      bundleFile(SEED_TARGET, SOURCE_LANGUAGE)
    )
    const createdAt = new Date().toISOString()

    const records: KeyRecord[] = Object.keys(source).map((key) => ({
      key,
      group: groupKeyOf(key),
      target: SEED_TARGET,
      origin: "import",
      createdAt,
    }))

    writeJson(keysFile, [...records, ...seedTemplates()])
  }

  /**
   * Fans `sample-data/templates.json` out into the same storage everything
   * else uses: one key per field in the registry, and its text in that
   * channel's language files. A template with no translation for a language
   * still gets an empty value there, exactly as `createKey` does, so it reads
   * as missing rather than as absent.
   *
   * Returns the key records to add, rather than writing them, so the registry
   * is written once.
   */
  function seedTemplates(): KeyRecord[] {
    if (!existsSync(templateSeedFile)) {
      writeJson(templatesFile, [])
      return []
    }

    const seeds = readJson<TemplateSeed[]>(templateSeedFile)
    const records: KeyRecord[] = []
    const registry: TemplateRecord[] = []
    // `${target}:${code}` → that file's contents, built up across templates.
    const bundles = new Map<string, LocaleBundle>()

    for (const { source, translations, ...template } of seeds) {
      registry.push(template)

      for (const field of fieldsOf(template.channel)) {
        const text = source[field.id]
        if (!text) {
          continue
        }

        const key = templateKeyOf(template.id, field.id)
        records.push({
          key,
          group: groupKeyOf(key),
          target: template.target,
          origin: "import",
          createdAt: template.createdAt,
        })

        for (const language of languages) {
          const id = `${template.target}:${language.code}`
          let values = bundles.get(id)
          if (!values) {
            values = {}
            bundles.set(id, values)
          }
          values[key] =
            language.code === SOURCE_LANGUAGE
              ? text
              : (translations?.[language.code]?.[field.id] ?? "")
        }
      }
    }

    for (const [id, values] of bundles) {
      const [target, code] = id.split(":")
      writeJson(bundleFile(target, code as LanguageCode), values)
    }

    writeJson(templatesFile, registry)
    return records
  }

  function ensureSeeded() {
    // The bundle check also re-seeds a `server-data` left by an older layout.
    if (
      !existsSync(keysFile) ||
      !existsSync(templatesFile) ||
      !existsSync(bundleFile(SEED_TARGET, SOURCE_LANGUAGE))
    ) {
      seed()
      clearCaches()
    }
  }

  function keyRecords(): KeyRecord[] {
    ensureSeeded()
    keyCache ??= readJson<KeyRecord[]>(keysFile)
    return keyCache
  }

  function templateRecords(): TemplateRecord[] {
    ensureSeeded()
    templateCache ??= readJson<TemplateRecord[]>(templatesFile)
    return templateCache
  }

  function bundle(target: string, code: LanguageCode): LocaleBundle {
    ensureSeeded()
    const id = `${target}:${code}`
    let cached = bundleCache.get(id)
    if (!cached) {
      const file = bundleFile(target, code)
      cached = existsSync(file) ? readJson<LocaleBundle>(file) : {}
      bundleCache.set(id, cached)
    }
    return cached
  }

  function writeKeys(records: KeyRecord[]) {
    writeJson(keysFile, records)
    keyCache = records
    coverageCache = null
  }

  function writeBundle(
    target: string,
    code: LanguageCode,
    values: LocaleBundle
  ) {
    writeJson(bundleFile(target, code), values)
    bundleCache.set(`${target}:${code}`, values)
    coverageCache = null
  }

  function languageOf(code: string): LanguageCode {
    const language = languages.find((item) => item.code === code)
    if (!language) {
      throw new HttpError(404, `Unknown language "${code}"`)
    }
    return language.code
  }

  /** Keys are unique per app, not globally — both halves are needed. */
  function recordOf(target: string, key: string): KeyRecord {
    const record = keyRecords().find(
      (item) => item.key === key && item.target === target
    )
    if (!record) {
      throw new HttpError(404, `No key "${key}" in ${target}`)
    }
    return record
  }

  return {
    /* ----------------------------------------------------------------- keys */

    /**
     * Creates a key in one app and fans it out across that app's languages:
     * the English text into its `en.json`, an empty value into the other
     * twelve. The empty write is deliberate — the key exists in every language
     * from the moment it is created, and reads as `missing` until someone
     * translates it.
     *
     * The fan-out never crosses apps. A key added to `app/parent` does not
     * appear in `web/school`, which is why the files are nested per app.
     */
    createKey(input: {
      key: string
      source: string
      target: string
    }): CreateKeyResponse {
      const key = input.key.trim()
      const source = input.source.trim()
      const target = input.target.trim()

      if (!key) {
        throw new HttpError(400, "Key is required.")
      }
      if (!isValidKey(key)) {
        throw new HttpError(
          400,
          "Use lowercase dot-separated segments — group.section.name."
        )
      }
      if (!source) {
        throw new HttpError(400, "English text is required.")
      }
      if (!target) {
        throw new HttpError(400, "Target is required.")
      }
      if (
        keyRecords().some(
          (record) => record.key === key && record.target === target
        )
      ) {
        throw new HttpError(409, `The key "${key}" already exists here.`)
      }

      for (const language of languages) {
        const isSource = language.code === SOURCE_LANGUAGE
        writeBundle(target, language.code, {
          ...bundle(target, language.code),
          [key]: isSource ? source : "",
        })
      }

      const record: KeyRecord = {
        key,
        group: groupKeyOf(key),
        target,
        origin: "manual",
        createdAt: new Date().toISOString(),
      }
      writeKeys([...keyRecords(), record])

      return { key: record, languages: languages.map((item) => item.code) }
    },

    deleteKey(target: string, key: string) {
      recordOf(target, key)

      for (const language of languages) {
        const values = { ...bundle(target, language.code) }
        delete values[key]
        writeBundle(target, language.code, values)
      }

      writeKeys(
        keyRecords().filter(
          (item) => !(item.key === key && item.target === target)
        )
      )
    },

    /* --------------------------------------------------------------- entries */

    entries(target: string, code: string): EntriesResponse {
      const language = languageOf(code)
      const source = bundle(target, SOURCE_LANGUAGE)
      const values = bundle(target, language)

      const entries = keyRecords()
        .filter((record) => record.target === target)
        .map((record): TranslationRow => {
          const sourceText = source[record.key] ?? ""
          return {
            key: record.key,
            group: record.group,
            source: sourceText,
            target: values[record.key] ?? "",
            status: statusOf(sourceText, values[record.key], language),
            origin: record.origin,
          }
        })

      return {
        target,
        language,
        sourceLanguage: SOURCE_LANGUAGE,
        entries,
      }
    },

    /* ------------------------------------------------------------- templates */

    /**
     * One channel's templates, with their text, in one language.
     *
     * The values travel with the list rather than behind a per-template
     * request: a channel holds tens of templates of a few short fields, so the
     * whole channel is a few kilobytes and the translate dialog can open
     * without a round trip.
     *
     * `needsReview` is counted with the same `checkTranslation` the dialog
     * shows inline, minus the length rule — that one needs the target's
     * profile, which lives in `src/config` and is the browser's business.
     */
    templates(target: string, code: string): TemplatesResponse {
      const language = languageOf(code)
      const source = bundle(target, SOURCE_LANGUAGE)
      const values = bundle(target, language)

      const entries: TemplateEntry[] = templateRecords()
        .filter((record) => record.target === target)
        .map((record) =>
          entryOf(record, source, values, language, (value) => {
            const field = fieldOf(record.channel, value.field)
            return (
              checkTranslation(value.source, value.target, {
                language,
                lengthBudget: Number.POSITIVE_INFINITY,
                maxLength: field.maxLength,
                format: field.format,
              }).length > 0
            )
          })
        )
        .sort((a, b) => a.template.name.localeCompare(b.template.name))

      return {
        target,
        language,
        sourceLanguage: SOURCE_LANGUAGE,
        templates: entries,
      }
    },

    saveTranslations(
      target: string,
      code: string,
      values: Record<string, string>
    ): SaveTranslationsResponse {
      const language = languageOf(code)
      const saved = Object.keys(values).length

      writeBundle(target, language, {
        ...bundle(target, language),
        ...values,
      })

      return { saved, file: relativeBundlePath(target, language) }
    },

    /* ---------------------------------------------------------------- export */

    /**
     * One JSON file per requested language, for this app only — the same
     * shape as the files on disk, so an export can be dropped straight back
     * into an application.
     *
     * The caller names each file, because the application receiving it decides
     * what its locale files are called: `zh-Hans` here may have to arrive as
     * `zh_CN.json`, and a Flutter app wants `.arb`.
     *
     * `includeUntranslated` keeps the keys `statusOf` calls missing — empty,
     * or still a copy of the English source. That is what a translator wants
     * to receive. Dropping them is what a runtime bundle wants: the key is
     * absent, so the application falls back to English by itself rather than
     * shipping a blank string or a duplicate.
     */
    exportFiles(
      target: string,
      requested: { language: string; name: string }[],
      includeUntranslated: boolean
    ): { name: string; data: string }[] {
      const records = keyRecords().filter((record) => record.target === target)
      if (records.length === 0) {
        throw new HttpError(404, `No keys in ${target} to export`)
      }

      const source = bundle(target, SOURCE_LANGUAGE)
      const taken = new Set<string>()

      return requested.map((file) => {
        const language = languageOf(file.language)
        const name = safeEntryName(file.name, `${language}.json`)

        // Two entries of the same name make an archive that unzips to one
        // file, silently losing a language. Better to refuse.
        if (taken.has(name.toLowerCase())) {
          throw new HttpError(
            400,
            `Two files are both called "${name}" — give each language its own name.`
          )
        }
        taken.add(name.toLowerCase())

        const values = bundle(target, language)
        const out: LocaleBundle = {}

        for (const record of records) {
          const value = values[record.key] ?? ""
          if (
            !includeUntranslated &&
            statusOf(source[record.key] ?? "", value, language) === "missing"
          ) {
            continue
          }
          out[record.key] = value
        }

        return { name, data: `${JSON.stringify(out, null, 2)}
` }
      })
    },

    /* -------------------------------------------------------------- coverage */

    /**
     * Per-language totals across every app, computed from the files with the
     * same `checkTranslation` the rows use — the generated `locale_coverage.ts`
     * and its script existed only because nothing could compute this at
     * runtime.
     */
    coverage(): CoverageResponse {
      if (coverageCache) {
        return coverageCache
      }

      const records = keyRecords()
      const groups = new Set(records.map((record) => record.group))

      const byTarget = new Map<string, KeyRecord[]>()
      const totalByGroup = new Map<string, number>()
      for (const record of records) {
        const group = byTarget.get(record.target)
        if (group) {
          group.push(record)
        } else {
          byTarget.set(record.target, [record])
        }
        totalByGroup.set(record.group, (totalByGroup.get(record.group) ?? 0) + 1)
      }

      const entries: LanguageCoverage[] = []

      for (const language of languages) {
        if (language.code === SOURCE_LANGUAGE) {
          continue
        }

        const issues: ReviewIssues = { placeholder: 0, whitespace: 0, script: 0 }
        const reviewByGroup = new Map<string, number>()
        let translated = 0
        let missing = 0

        for (const [target, targetRecords] of byTarget) {
          const source = bundle(target, SOURCE_LANGUAGE)
          const values = bundle(target, language.code)

          for (const record of targetRecords) {
            const sourceText = source[record.key] ?? ""
            const value = values[record.key]
            let flagged = false

            if (statusOf(sourceText, value, language.code) === "missing") {
              missing += 1
              flagged = true
            } else {
              translated += 1
              for (const issue of checkTranslation(sourceText, value ?? "", {
                language: language.code,
                // The length rule depends on the app's profile rather than the
                // language, so it is not counted here.
                lengthBudget: Number.POSITIVE_INFINITY,
              })) {
                if (
                  issue.id === "placeholder" ||
                  issue.id === "whitespace" ||
                  issue.id === "script"
                ) {
                  issues[issue.id] += 1
                  flagged = true
                }
              }
            }

            if (flagged) {
              reviewByGroup.set(
                record.group,
                (reviewByGroup.get(record.group) ?? 0) + 1
              )
            }
          }
        }

        const topGroups: GroupCoverage[] = [...reviewByGroup.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, TOP_GROUPS)
          .map(([group, needsReview]) => ({
            group,
            needsReview,
            total: totalByGroup.get(group) ?? 0,
          }))

        entries.push({
          code: language.code,
          translated,
          missing,
          issues,
          topGroups,
        })
      }

      entries.sort(
        (a, b) =>
          a.translated - b.translated ||
          b.issues.placeholder +
            b.issues.whitespace +
            b.issues.script -
            (a.issues.placeholder + a.issues.whitespace + a.issues.script)
      )

      coverageCache = {
        sourceKeyCount: records.length,
        groupCount: groups.size,
        languages: entries,
      }
      return coverageCache
    },

    /* ----------------------------------------------------------------- admin */

    /** Throws the working data away and re-seeds from `sample-data`. */
    reset() {
      seed()
      clearCaches()
    },
  }
}
