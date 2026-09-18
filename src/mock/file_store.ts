/**
 * The one thing the mock backend needs from whatever it is running on: a flat
 * store of small text documents, addressed by path.
 *
 * `store.ts` used to call `node:fs` directly, which pinned the mock to the Vite
 * dev server. Behind this interface the same store runs in two places — files
 * under `server-data/` while you develop (see `server/node_file_store.ts`) and
 * IndexedDB when the built app is served as static files with no backend at
 * all (see `browser_backend.ts`). The paths are identical in both, so what the
 * UI reports as `server-data/translations/web/school/vi.json` names the same
 * document either way.
 *
 * Reads and writes are synchronous because every caller in `store.ts` is, and
 * a backend that has to be awaited would turn one screen's worth of lookups
 * into a promise chain. The browser implementation keeps its documents in
 * memory and persists them behind the caller's back.
 */

import type { LanguageCode, LocaleBundle } from "../lib/locale_data.ts"
import type { TemplateFieldId, TemplateRecord } from "../lib/template_data.ts"

export type FileStore = {
  /** The document's text, or null if it was never written. */
  read(path: string): string | null
  write(path: string, text: string): void
  /** Throws every document away — the first half of a re-seed. */
  clear(): void
}

/**
 * `sample-data/templates.json`, one of them: a registry row plus the text, so
 * the seed is one readable file per concern rather than a registry and twelve
 * bundles a human has to keep in step by hand.
 */
export type TemplateSeed = TemplateRecord & {
  source: Partial<Record<TemplateFieldId, string>>
  translations?: Partial<
    Record<LanguageCode, Partial<Record<TemplateFieldId, string>>>
  >
}

/**
 * Where a first run gets its data from. Asynchronous because the browser has
 * to fetch the sample files rather than read them off a disk, and because
 * fetching ~3 MB of seed JSON is worth not doing until a visitor turns out to
 * need it.
 */
export type SeedSource = {
  /** One language's sample bundle, or null if the sample has no such file. */
  locale(code: LanguageCode): Promise<LocaleBundle | null>
  templates(): Promise<TemplateSeed[] | null>
}
