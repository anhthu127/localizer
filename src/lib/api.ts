/**
 * The only module in the app that knows a server exists.
 *
 * It currently talks to the mock backend in `server/mock_api.ts`, which serves
 * `/api` from the Vite dev server. Pointing it at the real service is a
 * `VITE_API_URL` away; if that service's shapes differ from
 * `lib/api_types.ts`, this file is where the mapping goes and no screen has to
 * change.
 */

import type {
  ApiErrorBody,
  CoverageResponse,
  CreateKeyRequest,
  CreateKeyResponse,
  EntriesResponse,
  SaveTranslationsResponse,
} from "@/lib/api_types"
import type { LanguageCode } from "@/lib/locale_data"

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api"

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: init?.body
        ? { "content-type": "application/json", ...init.headers }
        : init?.headers,
    })
  } catch (cause) {
    // A dead server is the one error the mock makes likely, so name it.
    throw new ApiError(0, `Cannot reach the API at ${BASE_URL} — ${messageOf(cause)}`)
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiError(
      response.status,
      body?.error ?? `${response.status} ${response.statusText}`
    )
  }

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

export function createKey(input: CreateKeyRequest) {
  return request<CreateKeyResponse>("/keys", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function deleteKey(target: string, key: string) {
  return request<void>(`/keys?${query({ target, key })}`, { method: "DELETE" })
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
      body: JSON.stringify({ values }),
    }
  )
}

export function fetchCoverage() {
  return request<CoverageResponse>("/coverage")
}

/** Throws the mock backend's working data away and re-seeds it. */
export function resetData() {
  return request<void>("/reset", { method: "POST" })
}
