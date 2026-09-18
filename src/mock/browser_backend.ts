/**
 * The mock backend, running in the tab.
 *
 * A static host — Vercel, Pages, an S3 bucket — serves `dist/` and nothing
 * else: there is no Node process, so `server/mock_api.ts` and its
 * `server-data/` folder are not there. The routes still are. This module gives
 * `router.ts` somewhere to keep its documents (IndexedDB) and somewhere to
 * seed them from (the sample JSON, emitted as ordinary static assets), then
 * hands `src/lib/api.ts` a `fetch` it can call instead of the network.
 *
 * So the deployed demo is the same backend as the dev one, minus the server.
 * The data is per visitor and per browser: yours to edit, reset and export,
 * invisible to anyone else, and gone if the browser's site data is cleared.
 * For a prototype that is the right trade — no database to run, no state a
 * stranger can break for everybody. A real deployment replaces all of this
 * with `VITE_API_URL`.
 */

import type { LanguageCode, LocaleBundle } from "../lib/locale_data.ts"
import type { FileStore, SeedSource, TemplateSeed } from "./file_store.ts"
import { handleRequest } from "./router.ts"
import { createStore } from "./store.ts"

const DB_NAME = "localizer-mock"
const DB_VERSION = 1
const STORE_NAME = "files"

/**
 * The sample data, as URLs rather than as imports.
 *
 * `?url` keeps ~3 MB of JSON out of the app bundle: Vite copies the files into
 * `dist/assets/` and this ends up holding their hashed paths, so a returning
 * visitor whose IndexedDB is already seeded never downloads them at all.
 */
const localeUrls = import.meta.glob("../../sample-data/locale/*.json", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>

const templatesUrl = import.meta.glob("../../sample-data/templates.json", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>

async function fetchJson<T>(url: string | undefined): Promise<T | null> {
  if (!url) {
    return null
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not load the sample data at ${url}`)
  }
  return (await response.json()) as T
}

const seeds: SeedSource = {
  locale: (code: LanguageCode) =>
    fetchJson<LocaleBundle>(localeUrls[`../../sample-data/locale/${code}.json`]),
  templates: () =>
    fetchJson<TemplateSeed[]>(templatesUrl["../../sample-data/templates.json"]),
}

/** Opens the database, or resolves to null where IndexedDB is unavailable. */
function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    // A private window, a blocked origin, a browser with storage disabled:
    // none of them should cost the visitor the demo, only its persistence.
    request.onerror = () => {
      resolve(null)
    }
    request.onblocked = () => {
      resolve(null)
    }
  })
}

function readAll(db: IDBDatabase): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const files = new Map<string, string>()
    const transaction = db.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(files)
        return
      }
      files.set(String(cursor.key), cursor.value as string)
      cursor.continue()
    }
    request.onerror = () => {
      resolve(files)
    }
  })
}

/**
 * Documents in memory, persisted behind the caller's back.
 *
 * `FileStore` is synchronous and IndexedDB is not, so the map is the store
 * and the database is a copy of it kept up to date. That is sound here
 * because one tab owns the data: nothing else writes, so nothing can be read
 * back stale. A write that fails to persist still succeeds for this session,
 * which is the behaviour a demo wants — the alternative is an error dialog
 * over a translation the visitor can see they just typed.
 */
function browserFileStore(
  db: IDBDatabase | null,
  files: Map<string, string>
): FileStore {
  const persist = (apply: (store: IDBObjectStore) => void) => {
    if (!db) {
      return
    }

    try {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      // Out of quota, mostly. The write has already landed in memory, so the
      // session carries on; only the next reload loses it.
      transaction.onerror = () => {
        console.warn("[mock] could not persist to IndexedDB", transaction.error)
      }
      apply(transaction.objectStore(STORE_NAME))
    } catch (cause) {
      console.warn("[mock] could not persist to IndexedDB", cause)
    }
  }

  return {
    read: (path) => files.get(path) ?? null,

    write: (path, text) => {
      files.set(path, text)
      persist((store) => store.put(text, path))
    },

    clear: () => {
      files.clear()
      persist((store) => store.clear())
    },
  }
}

type Handler = (request: Request, path: string) => Promise<Response>

/** Started once, on the first request, and shared by every one after it. */
let backend: Promise<Handler> | undefined

async function start() {
  const db = await openDatabase()
  const store = createStore(
    browserFileStore(db, db ? await readAll(db) : new Map()),
    seeds
  )
  return (request: Request, path: string) => handleRequest(store, request, path)
}

/**
 * The stand-in for `fetch` that `src/lib/api.ts` uses when the app was built
 * without a `VITE_API_URL`. Same path, same verbs, same `Response` — including
 * the `content-disposition` the export dialog reads its filename from.
 */
export async function localFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  backend ??= start()
  const handle = await backend

  // `Request` insists on an absolute URL; only the pathname and query survive
  // into the router, so the origin is a formality.
  const url = new URL(path, location.origin)
  return handle(new Request(url, init), url.pathname)
}
