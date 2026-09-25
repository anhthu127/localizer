/**
 * The only module in the app that knows a server exists.
 *
 * It currently talks to the mock backend in `src/mock/`, which serves the same
 * routes from two places: the Vite dev server at `/api` while you develop, and
 * the tab itself once the app is built and deployed to a static host, where
 * there is no server to serve them. Pointing it at the real service is a
 * `VITE_API_URL` away; if that service's shapes differ from
 * `lib/api_types.ts`, this file is where the mapping goes and no screen has to
 * change.
 */

import { currentUser } from "@/config/current_user"
import type {
  ApiErrorBody,
  CoverageResponse,
  CreateKeyRequest,
  CreateKeyResponse,
  DeleteKeysRequest,
  DeleteKeysResponse,
  EntriesResponse,
  ExportRequest,
  ImportMode,
  ImportRequest,
  ImportResponse,
  SaveTranslationsRequest,
  SaveTranslationsResponse,
  TemplatesResponse,
} from "@/lib/api_types"
import type { LanguageCode } from "@/lib/locale_data"

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api"

/**
 * A built app with no `VITE_API_URL` has nothing to fetch from: the dev
 * server's `/api` is a dev-server plugin, and a static host serves files.
 * Rather than ship a demo where every screen errors, the mock moves into the
 * browser - same routes, IndexedDB instead of `server-data/`.
 */
const IN_BROWSER = import.meta.env.PROD && !import.meta.env.VITE_API_URL

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Every failure a screen shows comes through here as a plain sentence. */
export function messageOf(cause: unknown): string {
  if (cause instanceof ApiError || cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response

  const request: RequestInit = {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  }

  try {
    if (IN_BROWSER) {
      // Loaded on demand so the mock is its own chunk, and not one a build
      // with a real `VITE_API_URL` ever downloads.
      const { localFetch } = await import("@/mock/browser_backend")
      response = await localFetch(path, request)
    } else {
      response = await fetch(`${BASE_URL}${path}`, request)
    }
  } catch (cause) {
    // A dead server is the one error the mock makes likely, so name it.
    throw new ApiError(
      0,
      `Cannot reach the API at ${BASE_URL} - ${messageOf(cause)}`
    )
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiError(
      response.status,
      body?.error ?? `${response.status} ${response.statusText}`
    )
  }

  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    if (value) {
      search.set(name, value)
    }
  }
  return search.toString()
}

export function fetchEntries(target: string, lang: LanguageCode) {
  return request<EntriesResponse>(`/entries?${query({ target, lang })}`)
}

/**
 * One channel's templates, text included - see `TemplatesResponse`.
 *
 * There is no save counterpart: a template's fields are ordinary keys, so the
 * dialog writes through `saveTranslations` below.
 */
export function fetchTemplates(target: string, lang: LanguageCode) {
  return request<TemplatesResponse>(`/templates?${query({ target, lang })}`)
}

/**
 * The author travels with the write, here rather than from every screen that
 * saves: who is signed in is not something a dialog should have to remember.
 * A real service reads it off the session instead and ignores what is sent -
 * see `config/current_user.ts`.
 */
export function createKey(input: CreateKeyRequest) {
  return request<CreateKeyResponse>("/keys", {
    method: "POST",
    body: JSON.stringify({
      createdBy: currentUser.name,
      ...input,
    } satisfies CreateKeyRequest),
  })
}

/**
 * Removes keys from one app, one language or all of them - see `DeleteScope`.
 *
 * One call whether the screen is deleting a row or a selection of four
 * thousand: a single key is a selection of one, and the server rewrites each
 * language file once either way.
 */
export function deleteKeys(input: DeleteKeysRequest) {
  return request<DeleteKeysResponse>("/keys/delete", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function saveTranslations(
  target: string,
  lang: LanguageCode,
  values: Record<string, string>
) {
  return request<SaveTranslationsResponse>(
    `/translations/${lang}?${query({ target })}`,
    {
      method: "PUT",
      body: JSON.stringify({
        values,
        by: currentUser.name,
      } satisfies SaveTranslationsRequest),
    }
  )
}

/**
 * Replaces one app's language file with an uploaded one.
 *
 * Whole-file, unlike `saveTranslations` above: the browser has already shown
 * the reviewer what it would change (`lib/bundle_diff.ts`) and this is the
 * confirmation. The server applies the same rule to the same file rather than
 * trusting a diff computed in the tab, so a key somebody edited while the
 * preview was open cannot be written from a stale reading of it.
 */
export function importBundle(
  target: string,
  lang: LanguageCode,
  values: Record<string, string>,
  mode: ImportMode
) {
  return request<ImportResponse>(`/import/${lang}?${query({ target })}`, {
    method: "PUT",
    body: JSON.stringify({
      values,
      mode,
      by: currentUser.name,
    } satisfies ImportRequest),
  })
}

export function fetchCoverage() {
  return request<CoverageResponse>("/coverage")
}

/**
 * A .zip of one JSON file per language, for one app.
 *
 * The name comes back in `content-disposition` rather than being rebuilt
 * here, so what the browser saves is what the server actually named it.
 */
export async function exportBundle(input: ExportRequest) {
  const response = await send("/export", {
    method: "POST",
    body: JSON.stringify(input),
  })

  // `filename*` first: it is the percent-encoded UTF-8 one, and the plain
  // `filename` beside it is an ASCII fallback with the accents flattened.
  const disposition = response.headers.get("content-disposition") ?? ""
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const plain = /filename="([^"]+)"/.exec(disposition)

  return {
    blob: await response.blob(),
    filename: encoded
      ? decodeURIComponent(encoded[1])
      : (plain?.[1] ?? "translations.zip"),
  }
}

/** Hands the browser a file to save. */
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Throws the mock backend's working data away and re-seeds it. */
export function resetData() {
  return request<void>("/reset", { method: "POST" })
}
