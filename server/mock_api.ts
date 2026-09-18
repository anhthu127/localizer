/**
 * A stand-in localization backend, mounted on the Vite dev server at `/api`.
 *
 * It exists so the app can be built against HTTP rather than against a pile of
 * imported JSON: every screen fetches, every edit is a request, and the data
 * lives in files a human can open (see `store.ts`). Every route is scoped to
 * one app, because every app is its own key namespace. When the real service is
 * ready, drop this plugin from `vite.config.ts` and point `VITE_API_URL` at
 * it — `src/lib/api.ts` is the only other file that knows a server exists.
 *
 *   GET    /api/entries?target=&lang=    one app's keys, with status computed
 *   GET    /api/templates?target=&lang=  one channel's message templates, text included
 *   POST   /api/keys                     create a key in one app, in every language
 *   DELETE /api/keys?target=&key=        delete one app's key, every language
 *   PUT    /api/translations/:lang?target=
 *                                        save a batch of one app's translations
 *   POST   /api/export                   a .zip, one named file per language
 *   GET    /api/coverage                 per-language totals, every app
 *   POST   /api/reset                    re-seed from sample-data
 *
 * The key is passed as a query parameter rather than a path segment because
 * real keys contain slashes — `school_admin/campus_admin.inviteadmin.text`.
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

import type {
  CreateKeyRequest,
  ExportRequest,
  SaveTranslationsRequest,
} from "../src/lib/api_types.ts"
import { safeFileName } from "../src/lib/file_name.ts"
import { createStore, HttpError, type Store } from "./store.ts"
import { createZip } from "./zip.ts"

const BASE_PATH = "/api"

export function mockApi(): Plugin {
  let store: Store | null = null

  return {
    name: "localizer-mock-api",

    configResolved(config) {
      store = createStore(config.root)
    },

    configureServer(server) {
      server.middlewares.use(BASE_PATH, (req, res, next) => {
        if (!store) {
          next()
          return
        }

        handle(store, req, res).catch((cause: unknown) => {
          const status = cause instanceof HttpError ? cause.status : 500
          const message =
            cause instanceof Error ? cause.message : String(cause)

          if (status >= 500) {
            server.config.logger.error(
              `[mock-api] ${req.method} ${req.url} — ${message}`
            )
          }
          json(res, status, { error: message })
        })
      })
    },
  }
}

async function handle(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Mounted at /api, so the prefix is already stripped from req.url.
  const url = new URL(req.url ?? "/", "http://localhost")
  const path = url.pathname.replace(/\/+$/, "")
  const method = req.method ?? "GET"
  const query = url.searchParams

  if (method === "POST" && path === "/keys") {
    const body = await readBody<CreateKeyRequest>(req)
    json(res, 201, store.createKey(body))
    return
  }

  if (method === "DELETE" && path === "/keys") {
    store.deleteKey(
      required(query.get("target"), "target"),
      required(query.get("key"), "key")
    )
    empty(res)
    return
  }

  if (method === "GET" && path === "/templates") {
    json(
      res,
      200,
      store.templates(
        required(query.get("target"), "target"),
        required(query.get("lang"), "lang")
      )
    )
    return
  }

  if (method === "GET" && path === "/entries") {
    json(
      res,
      200,
      store.entries(
        required(query.get("target"), "target"),
        required(query.get("lang"), "lang")
      )
    )
    return
  }

  const translations = /^\/translations\/([A-Za-z-]+)$/.exec(path)
  if (method === "PUT" && translations) {
    const body = await readBody<SaveTranslationsRequest>(req)
    if (!body.values || typeof body.values !== "object") {
      throw new HttpError(400, "Expected { values: { key: text } }")
    }
    json(
      res,
      200,
      store.saveTranslations(
        required(query.get("target"), "target"),
        translations[1],
        body.values
      )
    )
    return
  }

  if (method === "POST" && path === "/export") {
    const body = await readBody<ExportRequest>(req)

    if (!body.target) {
      throw new HttpError(400, `Missing "target"`)
    }
    if (!Array.isArray(body.files) || body.files.length === 0) {
      throw new HttpError(400, "Pick at least one language to export.")
    }

    const files = store.exportFiles(
      body.target,
      body.files,
      body.includeUntranslated !== false
    )
    const name = safeFileName(
      body.name ?? "",
      `${body.target.replaceAll("/", "-")}-translations`
    )

    zip(res, `${name}.zip`, createZip(files))
    return
  }

  if (method === "GET" && path === "/coverage") {
    json(res, 200, store.coverage())
    return
  }

  if (method === "POST" && path === "/reset") {
    store.reset()
    empty(res)
    return
  }

  throw new HttpError(404, `No route for ${method} ${BASE_PATH}${path}`)
}

function required(value: string | null, name: string): string {
  if (!value) {
    throw new HttpError(400, `Missing "${name}" parameter`)
  }
  return value
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }

  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw) {
    throw new HttpError(400, "Expected a JSON body")
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new HttpError(400, "Body is not valid JSON")
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}

function empty(res: ServerResponse) {
  res.statusCode = 204
  res.end()
}

function zip(res: ServerResponse, filename: string, body: Buffer) {
  res.statusCode = 200
  res.setHeader("content-type", "application/zip")
  res.setHeader("content-length", body.length)
  // The browser reads the download name from here, so the name typed into
  // the export dialog survives the round trip.
  //
  // Two forms, per RFC 6266: header values are latin1, and Node throws on
  // anything outside it, so a Vietnamese name can only travel percent-encoded
  // in `filename*`. `filename` carries an ASCII fallback for clients that do
  // not read the starred form.
  res.setHeader(
    "content-disposition",
    [
      "attachment",
      `filename="${filename.replaceAll(/[^ -~]/g, "_")}"`,
      `filename*=UTF-8''${encodeURIComponent(filename)}`,
    ].join("; ")
  )
  res.end(body)
}
