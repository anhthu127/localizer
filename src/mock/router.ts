/**
 * The mock localization backend's routes, written against `Request` and
 * `Response` rather than against any one server.
 *
 * It exists so the app can be built against HTTP rather than against a pile of
 * imported JSON: every screen fetches, every edit is a request, and the data
 * lives in documents a human can open (see `store.ts`). Every route is scoped
 * to one app, because every app is its own key namespace. When the real
 * service is ready, delete `src/mock/` and point `VITE_API_URL` at it —
 * `src/lib/api.ts` is the only other file that knows a server exists.
 *
 *   GET    /entries?target=&lang=    one app's keys, with status computed
 *   GET    /templates?target=&lang=  one channel's message templates, text included
 *   POST   /keys                     create a key in one app, in every language
 *   DELETE /keys?target=&key=        delete one app's key, every language
 *   PUT    /translations/:lang?target=
 *                                    save a batch of one app's translations
 *   PUT    /import/:lang?target=     replace one app's language file wholesale
 *   POST   /export                   a .zip, one named file per language
 *   GET    /coverage                 per-language totals, every app
 *   POST   /reset                    re-seed from sample-data
 *
 * The key is passed as a query parameter rather than a path segment because
 * real keys contain slashes — `school_admin/campus_admin.inviteadmin.text`.
 *
 * Two callers reach this: `server/mock_api.ts` mounts it on the Vite dev
 * server at `/api`, and `browser_backend.ts` calls it straight from the tab
 * when the built app is served with no backend behind it. Web `Request` and
 * `Response` are the only vocabulary both of them share.
 */

import type {
  CreateKeyRequest,
  ExportRequest,
  ImportRequest,
  SaveTranslationsRequest,
} from "../lib/api_types.ts"
import { safeFileName } from "../lib/file_name.ts"
import { HttpError, type Store } from "./store.ts"
import { createZip, type Bytes } from "./zip.ts"

/**
 * Answers one request, and turns any failure into the `{ error }` body that
 * `src/lib/api.ts` unwraps into an `ApiError`. The path is taken relative to
 * whatever prefix the caller mounted this under.
 */
export async function handleRequest(
  store: Store,
  request: Request,
  path: string
): Promise<Response> {
  try {
    await store.ready()
    return await route(store, request, path.replace(/\/+$/, ""))
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500
    const message = cause instanceof Error ? cause.message : String(cause)
    return json(status, { error: message })
  }
}

async function route(
  store: Store,
  request: Request,
  path: string
): Promise<Response> {
  const query = new URL(request.url).searchParams
  const method = request.method.toUpperCase()

  if (method === "POST" && path === "/keys") {
    const input = await body<CreateKeyRequest>(request)
    return json(201, store.createKey({ ...input, createdBy: author(input.createdBy) }))
  }

  if (method === "DELETE" && path === "/keys") {
    store.deleteKey(
      required(query.get("target"), "target"),
      required(query.get("key"), "key")
    )
    return empty()
  }

  if (method === "GET" && path === "/templates") {
    return json(
      200,
      store.templates(
        required(query.get("target"), "target"),
        required(query.get("lang"), "lang")
      )
    )
  }

  if (method === "GET" && path === "/entries") {
    return json(
      200,
      store.entries(
        required(query.get("target"), "target"),
        required(query.get("lang"), "lang")
      )
    )
  }

  const translations = /^\/translations\/([A-Za-z-]+)$/.exec(path)
  if (method === "PUT" && translations) {
    const input = await body<SaveTranslationsRequest>(request)
    if (!input.values || typeof input.values !== "object") {
      throw new HttpError(400, "Expected { values: { key: text } }")
    }
    return json(
      200,
      store.saveTranslations(
        required(query.get("target"), "target"),
        translations[1],
        input.values,
        author(input.by)
      )
    )
  }

  const imported = /^\/import\/([A-Za-z-]+)$/.exec(path)
  if (method === "PUT" && imported) {
    const input = await body<ImportRequest>(request)

    if (!input.values || typeof input.values !== "object") {
      throw new HttpError(400, "Expected { values: { key: text } }")
    }
    // A file that reached here has been read and previewed in the browser, so
    // a value that is not text is a caller bug rather than a bad upload — but
    // the store writes straight to disk, so it is checked here all the same.
    for (const [key, value] of Object.entries(input.values)) {
      if (typeof value !== "string") {
        throw new HttpError(400, `"${key}" is not text.`)
      }
    }
    if (input.mode !== "replace" && input.mode !== "merge") {
      throw new HttpError(400, `Expected "mode" to be "replace" or "merge"`)
    }

    return json(
      200,
      store.importBundle(
        required(query.get("target"), "target"),
        imported[1],
        input.values,
        input.mode,
        author(input.by)
      )
    )
  }

  if (method === "POST" && path === "/export") {
    const input = await body<ExportRequest>(request)

    if (!input.target) {
      throw new HttpError(400, `Missing "target"`)
    }
    if (!Array.isArray(input.files) || input.files.length === 0) {
      throw new HttpError(400, "Pick at least one language to export.")
    }

    const files = store.exportFiles(
      input.target,
      input.files,
      input.includeUntranslated !== false
    )
    const name = safeFileName(
      input.name ?? "",
      `${input.target.replaceAll("/", "-")}-translations`
    )

    return zip(`${name}.zip`, await createZip(files))
  }

  if (method === "GET" && path === "/coverage") {
    return json(200, store.coverage())
  }

  if (method === "POST" && path === "/reset") {
    await store.reset()
    return empty()
  }

  throw new HttpError(404, `No route for ${method} ${path}`)
}

/**
 * The name the audit trail records. The mock has no session, so it believes
 * what the browser sent and names the gap when nothing was sent — a real
 * service takes the author from the token instead and ignores this field.
 */
function author(value: string | undefined): string {
  return value?.trim() || "Unknown"
}

function required(value: string | null, name: string): string {
  if (!value) {
    throw new HttpError(400, `Missing "${name}" parameter`)
  }
  return value
}

async function body<T>(request: Request): Promise<T> {
  const raw = await request.text()
  if (!raw) {
    throw new HttpError(400, "Expected a JSON body")
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new HttpError(400, "Body is not valid JSON")
  }
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function empty(): Response {
  return new Response(null, { status: 204 })
}

function zip(filename: string, data: Bytes): Response {
  return new Response(data, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      // The browser reads the download name from here, so the name typed into
      // the export dialog survives the round trip.
      //
      // Two forms, per RFC 6266: header values are latin1, and Node throws on
      // anything outside it, so a Vietnamese name can only travel
      // percent-encoded in `filename*`. `filename` carries an ASCII fallback
      // for clients that do not read the starred form.
      "content-disposition": [
        "attachment",
        `filename="${filename.replaceAll(/[^ -~]/g, "_")}"`,
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
      ].join("; "),
    },
  })
}
