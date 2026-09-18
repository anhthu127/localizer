import { useCallback, useEffect, useState } from "react"

import { fetchEntries, messageOf } from "@/lib/api"
import type { LanguageCode, TranslationRow } from "@/lib/locale_data"

type Loaded = {
  token: string
  rows: TranslationRow[]
}

type Failed = {
  token: string
  message: string
}

type State = {
  rows: TranslationRow[]
  isLoading: boolean
  error: string | null
  /** Refetches the same target and language — call it after a write. */
  reload: () => void
}

/**
 * One app's keys in one language, from `GET /api/entries`.
 *
 * Status arrives computed by the server rather than derived here, so the list,
 * the dashboard and any future export all agree about what is missing. An app
 * nobody has added keys to answers with an empty list, which is the screen's
 * empty state rather than an error.
 */
export function useTranslationRows(
  target: string,
  language: LanguageCode
): State {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<Failed | null>(null)
  const [nonce, setNonce] = useState(0)

  const token = `${target}:${language}`

  useEffect(() => {
    let cancelled = false
    const current = `${target}:${language}`

    fetchEntries(target, language)
      .then((response) => {
        if (!cancelled) {
          setLoaded({ token: current, rows: response.entries })
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFailed({ token: current, message: messageOf(cause) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [target, language, nonce])

  // Derived during render rather than reset inside the effect, so switching
  // language does not cost an extra render pass. A reload keeps the old rows
  // on screen until the new ones land.
  const rows = loaded?.token === token ? loaded.rows : null
  const error = failed?.token === token ? failed.message : null

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    rows: rows ?? [],
    isLoading: !rows && !error,
    error,
    reload,
  }
}
