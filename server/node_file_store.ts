/**
 * The dev server's half of the mock backend: `FileStore` over real files.
 *
 * `server-data/` is not a cache — it is the point. While you are building
 * screens you want to open `server-data/translations/web/school/vi.json` in
 * the editor and see the row you just saved, and `npm run mock:reset` to be a
 * folder you can delete. The browser's IndexedDB copy in
 * `src/mock/browser_backend.ts` is the same store without that luxury, for
 * deploys with no Node process behind them.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { LocaleBundle } from "../src/lib/locale_data.ts"
import type {
  FileStore,
  SeedSource,
  TemplateSeed,
} from "../src/mock/file_store.ts"

/** Documents under `<root>/server-data`, one file per path. */
export function nodeFileStore(root: string): FileStore {
  const dataDir = join(root, "server-data")
  const fileOf = (path: string) => join(dataDir, ...path.split("/"))

  return {
    read: (path) => {
      const file = fileOf(path)
      return existsSync(file) ? readFileSync(file, "utf8") : null
    },

    write: (path, text) => {
      const file = fileOf(path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text, "utf8")
    },

    clear: () => {
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** The sample export, read straight off the disk it is checked in on. */
export function nodeSeeds(root: string): SeedSource {
  const seedDir = join(root, "sample-data", "locale")
  const templateSeedFile = join(root, "sample-data", "templates.json")

  const readJson = <T>(file: string): T | null =>
    existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null

  return {
    locale: (code) =>
      Promise.resolve(readJson<LocaleBundle>(join(seedDir, `${code}.json`))),
    templates: () => Promise.resolve(readJson<TemplateSeed[]>(templateSeedFile)),
  }
}
