/**
 * The mock backend's storage layer: a handful of JSON documents, addressed by
 * path through `FileStore`.
 *
 *   keys.json                        the key registry — one row per key
 *   templates.json                   the template registry — one row per template
 *   translations/<app>/<code>.json   one file per app per language
 *   audit/<app>/<code>.json          who last wrote each of those values
 *
 * Where those documents actually live is the caller's business: real files
 * under `server-data/` on the dev server, IndexedDB in a tab with no backend
 * behind it. Nothing in this file knows which, and nothing in it imports
 * `node:` anything — that is what lets the same mock serve a static deploy.
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
 * the sample export stays pristine and `npm run mock:reset` (or the Reset
 * button) puts the demo back to where it started.
 *
 * English is not special: `<app>/en.json` is a language file like any other,
 * and the registry holds no text at all. That is how a real schema would
 * separate a key from its translations, which is the point — the API this
 * backs can be swapped for a real one without the app noticing.
 *
 * Status and validation are imported from `src/lib` rather than restated, so
 * the server and the browser cannot disagree about what "missing" means.
 */

import type {
  AuditLog,
  CoverageResponse,
  CreateKeyResponse,
  DeleteKeysResponse,
  DeleteScope,
  EntriesResponse,
  GroupCoverage,
  ImportMode,
  ImportResponse,
  KeyRecord,
  LanguageCoverage,
  ReviewIssues,
  SaveTranslationsResponse,
  TemplatesResponse,
} from "../lib/api_types.ts"
import { safeEntryName } from "../lib/file_name.ts"
import {
  groupKeyOf,
  IMPORT_AUTHOR,
  isValidKey,
  languages,
  SOURCE_LANGUAGE,
  statusOf,
  type AuditStamp,
  type LanguageCode,
  type LocaleBundle,
  type TranslationRow,
} from "../lib/locale_data.ts"
import {
  entryOf,
  fieldOf,
  fieldsOf,
  templateKeyOf,
  type TemplateEntry,
  type TemplateRecord,
} from "../lib/template_data.ts"
import { checkTranslation } from "../lib/validation.ts"
import type { FileStore, SeedSource } from "./file_store.ts"

/** The app the sample export belongs to — see `src/config/target_profiles.ts`. */
const SEED_TARGET = "web/school"

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

export function createStore(files: FileStore, seeds: SeedSource) {
  const keysFile = "keys.json"
  const templatesFile = "templates.json"

  // The documents are the source of truth, but parsing 13 × 200 KB on every
  // request would make the workspace feel like a slideshow. Everything is
  // cached and invalidated on write.
  let keyCache: KeyRecord[] | null = null
  let templateCache: TemplateRecord[] | null = null
  const bundleCache = new Map<string, LocaleBundle>()
  const auditCache = new Map<string, AuditLog>()
  let coverageCache: CoverageResponse | null = null
  let seeding: Promise<void> | null = null

  const clearCaches = () => {
    keyCache = null
    templateCache = null
    bundleCache.clear()
    auditCache.clear()
    coverageCache = null
  }

  const readJson = <T>(file: string): T | null => {
    const text = files.read(file)
    return text === null ? null : (JSON.parse(text) as T)
  }

  const writeJson = (file: string, value: unknown) => {
    files.write(file, `${JSON.stringify(value, null, 2)}\n`)
  }

  /** `web/school` + `vi` → `translations/web/school/vi.json`. */
  const bundleFile = (target: string, code: LanguageCode) =>
    `translations/${target}/${code}.json`

  /**
   * The log that shadows it — `audit/web/school/vi.json`, keyed the same way.
   *
   * Beside the bundle rather than inside it: a bundle is a plain `key: text`
   * document that gets exported and shipped as-is, and an audit trail has no
   * business travelling with it.
   */
  const auditFile = (target: string, code: LanguageCode) =>
    `audit/${target}/${code}.json`

  /** The same path as the UI shows it — forward slashes, relative to the repo. */
  const relativeBundlePath = (target: string, code: LanguageCode) =>
    `server-data/${bundleFile(target, code)}`

  async function seed() {
    // Always from a clean slate, so a half-written or older layout cannot
    // survive into the new one.
    files.clear()

    const source: LocaleBundle = {}

    for (const language of languages) {
      const values = (await seeds.locale(language.code)) ?? {}
      writeJson(bundleFile(SEED_TARGET, language.code), values)
      if (language.code === SOURCE_LANGUAGE) {
        Object.assign(source, values)
      }
    }

    const createdAt = new Date().toISOString()

    const records: KeyRecord[] = Object.keys(source).map((key) => ({
      key,
      group: groupKeyOf(key),
      target: SEED_TARGET,
      origin: "import",
      createdAt,
      createdBy: IMPORT_AUTHOR,
    }))

    writeJson(keysFile, [...records, ...(await seedTemplates())])
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
  async function seedTemplates(): Promise<KeyRecord[]> {
    const seedRows = await seeds.templates()

    if (!seedRows) {
      writeJson(templatesFile, [])
      return []
    }

    const records: KeyRecord[] = []
    const registry: TemplateRecord[] = []
    // `${target}:${code}` → that file's contents, built up across templates.
    const bundles = new Map<string, LocaleBundle>()

    for (const { source, translations, ...template } of seedRows) {
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
          // The registry knows who wrote the message. Its seeded translations
          // have no author of their own and fall back to the import.
          createdBy: template.createdBy,
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
      // The seed app's own files were just written above, so a template that
      // belongs to it has to merge rather than replace.
      const file = bundleFile(target, code as LanguageCode)
      writeJson(file, { ...(readJson<LocaleBundle>(file) ?? {}), ...values })
    }

    writeJson(templatesFile, registry)
    return records
  }

  /**
   * Seeds an empty store. Awaited once per request instead of from every
   * accessor below, which is what keeps those accessors synchronous now that
   * a seed can involve the network.
   *
   * The bundle check also re-seeds data left by an older layout.
   */
  function ready(): Promise<void> {
    if (
      files.read(keysFile) !== null &&
      files.read(templatesFile) !== null &&
      files.read(bundleFile(SEED_TARGET, SOURCE_LANGUAGE)) !== null &&
      !isStale()
    ) {
      return Promise.resolve()
    }

    // Two requests in flight against a cold store must not both seed it.
    seeding ??= seed()
      .then(clearCaches)
      .finally(() => {
        seeding = null
      })
    return seeding
  }

  /**
   * A registry written before the audit trail existed has no `createdBy`. It
   * is working data seeded from `sample-data`, so re-seeding costs nothing
   * and beats serving half a trail.
   */
  function isStale(): boolean {
    try {
      const [first] = readJson<KeyRecord[]>(keysFile) ?? []
      return first !== undefined && first.createdBy === undefined
    } catch {
      return true
    }
  }

  function keyRecords(): KeyRecord[] {
    keyCache ??= readJson<KeyRecord[]>(keysFile) ?? []
    return keyCache
  }

  function templateRecords(): TemplateRecord[] {
    templateCache ??= readJson<TemplateRecord[]>(templatesFile) ?? []
    return templateCache
  }

  function bundle(target: string, code: LanguageCode): LocaleBundle {
    const id = `${target}:${code}`
    let cached = bundleCache.get(id)
    if (!cached) {
      cached = readJson<LocaleBundle>(bundleFile(target, code)) ?? {}
      bundleCache.set(id, cached)
    }
    return cached
  }

  function auditLog(target: string, code: LanguageCode): AuditLog {
    const id = `${target}:${code}`
    let cached = auditCache.get(id)
    if (!cached) {
      cached = readJson<AuditLog>(auditFile(target, code)) ?? {}
      auditCache.set(id, cached)
    }
    return cached
  }

  function writeAuditLog(target: string, code: LanguageCode, log: AuditLog) {
    writeJson(auditFile(target, code), log)
    auditCache.set(`${target}:${code}`, log)
  }

  /**
   * What to show for a value nobody has written through this app: the text
   * arrived with the key, so the key's own stamp is the honest answer.
   */
  function originStamp(record: KeyRecord): AuditStamp {
    return {
      by: record.origin === "manual" ? record.createdBy : IMPORT_AUTHOR,
      at: record.createdAt,
    }
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
      createdBy: string
    }): CreateKeyResponse {
      const key = input.key.trim()
      const source = input.source.trim()
      const target = input.target.trim()
      const createdBy = input.createdBy.trim() || IMPORT_AUTHOR

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
        createdBy,
      }
      writeKeys([...keyRecords(), record])

      return { key: record, languages: languages.map((item) => item.code) }
    },

    /**
     * Removes keys from one app, as far as the scope says — see `DeleteScope`.
     *
     * The selection is intersected with what the app actually holds before
     * anything is written, so a stale tab cannot make the counts lie, and the
     * language files are rewritten once each rather than once per key: a bulk
     * delete is thousands of keys over thirteen files, not the other way round.
     */
    deleteKeys(input: {
      target: string
      keys: string[]
      scope: DeleteScope
      language?: string
    }): DeleteKeysResponse {
      const { target, scope } = input

      if (input.keys.length === 0) {
        throw new HttpError(400, "Pick at least one key to delete.")
      }

      const asked = new Set(input.keys)
      const held = new Set(
        keyRecords()
          .filter((record) => record.target === target && asked.has(record.key))
          .map((record) => record.key)
      )

      if (held.size === 0) {
        throw new HttpError(
          404,
          asked.size === 1
            ? `No key "${input.keys[0]}" in ${target}`
            : `None of those ${asked.size} keys are in ${target}`
        )
      }

      const codes =
        scope === "all"
          ? languages.map((item) => item.code)
          : [languageOf(input.language ?? "")]

      for (const code of codes) {
        const values = { ...bundle(target, code) }
        const log = { ...auditLog(target, code) }

        for (const key of held) {
          delete values[key]
          delete log[key]
        }

        writeBundle(target, code, values)
        writeAuditLog(target, code, log)
      }

      if (scope === "all") {
        writeKeys(
          keyRecords().filter(
            (record) => !(record.target === target && held.has(record.key))
          )
        )
      }

      return {
        scope,
        deleted: held.size,
        files: codes.map((code) => relativeBundlePath(target, code)),
      }
    },

    /* --------------------------------------------------------------- entries */

    entries(target: string, code: string): EntriesResponse {
      const language = languageOf(code)
      const source = bundle(target, SOURCE_LANGUAGE)
      const values = bundle(target, language)
      const log = auditLog(target, language)

      const entries = keyRecords()
        .filter((record) => record.target === target)
        .map((record): TranslationRow => {
          const sourceText = source[record.key] ?? ""
          const value = values[record.key] ?? ""
          return {
            key: record.key,
            group: record.group,
            source: sourceText,
            target: value,
            status: statusOf(sourceText, values[record.key], language),
            origin: record.origin,
            created: { by: record.createdBy, at: record.createdAt },
            // Nothing logged and nothing in the field: nobody has written a
            // value, so the row says so rather than inventing an editor.
            updated:
              log[record.key] ?? (value ? originStamp(record) : undefined),
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

    /**
     * `by` is the audit trail's author. It comes off the request because the
     * mock has no session to read it from; a real service takes it from the
     * token and ignores whatever the browser claimed — an audit trail the
     * client can forge is not one. See `src/config/current_user.ts`.
     */
    saveTranslations(
      target: string,
      code: string,
      values: Record<string, string>,
      by: string
    ): SaveTranslationsResponse {
      const language = languageOf(code)
      const keys = Object.keys(values)
      const at = new Date().toISOString()

      writeBundle(target, language, {
        ...bundle(target, language),
        ...values,
      })

      const log = { ...auditLog(target, language) }
      for (const key of keys) {
        // Emptying a value puts the row back to untranslated, so its stamp
        // goes with it rather than reading as a translation somebody made.
        if (values[key] === "") {
          delete log[key]
        } else {
          log[key] = { by, at }
        }
      }
      writeAuditLog(target, language, log)

      return { saved: keys.length, file: relativeBundlePath(target, language) }
    },

    /**
     * Replaces one app's language file with an uploaded one, and registers the
     * keys it brings that the app did not have.
     *
     * A file is allowed to extend the registry, so an app's keys can arrive as
     * a delivery rather than one dialog at a time. A key created this way is
     * registered from the file being imported and carried into every other
     * language with no text, which means a file that is not English registers
     * the key with no English either: it reads as missing there until somebody
     * fills it in, and the preview says so before any of this happens.
     *
     * `replace` is a real replace — a key the file leaves out is emptied, and
     * reads as missing again. `merge` leaves those keys alone. Neither drops a
     * key from the registry; replacing a language is not a statement about
     * which keys the app has. The browser has shown the reviewer which of the
     * two they are about to do, computed with the same rule
     * (`lib/bundle_diff.ts`), but the counts returned here are what actually
     * happened to the file.
     */
    importBundle(
      target: string,
      code: string,
      values: Record<string, string>,
      mode: ImportMode,
      by: string
    ): ImportResponse {
      const language = languageOf(code)
      const records = keyRecords().filter((record) => record.target === target)
      const known = new Set(records.map((record) => record.key))
      const at = new Date().toISOString()

      // The same rule the preview drew in `bundle_diff.ts`, written out again
      // here because the store writes straight to disk and cannot take the
      // browser's word for what the file holds: a key the registry does not
      // have is registered from the file, unless its name is one the registry
      // cannot address at all.
      const invalid: string[] = []
      const fresh: KeyRecord[] = []

      for (const key of Object.keys(values)) {
        if (known.has(key)) {
          continue
        }
        if (!isValidKey(key)) {
          invalid.push(key)
          continue
        }
        fresh.push({
          key,
          group: groupKeyOf(key),
          target,
          origin: "import",
          createdAt: at,
          createdBy: by,
        })
      }

      if (records.length === 0 && fresh.length === 0) {
        throw new HttpError(404, `No keys in ${target} to import into`)
      }

      const current = bundle(target, language)
      const log = { ...auditLog(target, language) }
      const next: LocaleBundle = {}

      let added = 0
      let changed = 0
      let removed = 0
      let unchanged = 0

      for (const record of records) {
        const before = current[record.key] ?? ""
        const incoming = values[record.key]
        const after =
          incoming === undefined ? (mode === "replace" ? "" : before) : incoming

        next[record.key] = after

        if (after === before) {
          unchanged += 1
          continue
        }

        if (before === "") {
          added += 1
        } else if (after === "") {
          removed += 1
        } else {
          changed += 1
        }

        // Same rule as `saveTranslations`: an emptied value is not a
        // translation anybody made, so its stamp goes with it.
        if (after === "") {
          delete log[record.key]
        } else {
          log[record.key] = { by, at }
        }
      }

      // Counted as `created` rather than `added`: the key did not exist to be
      // filled in. Its text still earns a stamp — somebody wrote it.
      for (const record of fresh) {
        const after = values[record.key]
        next[record.key] = after

        if (after !== "") {
          log[record.key] = { by, at }
        }
      }

      writeBundle(target, language, next)
      writeAuditLog(target, language, log)

      if (fresh.length > 0) {
        // Every language carries every key, exactly as `createKey` leaves it:
        // a language with no text for one reads as missing rather than as a
        // language the key was never meant for.
        for (const item of languages) {
          if (item.code === language) {
            continue
          }
          const others = { ...bundle(target, item.code) }
          for (const record of fresh) {
            others[record.key] = ""
          }
          writeBundle(target, item.code, others)
        }

        writeKeys([...keyRecords(), ...fresh])
      }

      return {
        created: fresh.length,
        added,
        changed,
        removed,
        unchanged,
        invalid,
        file: relativeBundlePath(target, language),
      }
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

    /**
     * Awaited at the top of every request, so a cold store seeds itself before
     * the first read rather than in the middle of one.
     */
    ready,

    /** Throws the working data away and re-seeds from `sample-data`. */
    async reset() {
      await seed()
      clearCaches()
    },
  }
}
