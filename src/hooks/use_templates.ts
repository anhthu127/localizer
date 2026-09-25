import { useCallback, useEffect, useState } from "react"

import { fetchTemplates, messageOf } from "@/lib/api"
import type { LanguageCode } from "@/lib/locale_data"
import type { TemplateEntry } from "@/lib/template_data"

type Loaded = {
  token: string
  templates: TemplateEntry[]
}

type Failed = {
  token: string
  message: string
}

type State = {
  templates: TemplateEntry[]
  isLoading: boolean
  error: string | null
  /** Refetches the same channel and language - call it after a save. */
  reload: () => void
}

/**
 * One channel's templates in one language, from `GET /api/templates`.
 *
 * The same shape as `use_translation_rows`, and for the same reasons: the
 * response carries status computed by the server, a channel nobody has seeded
 * answers with an empty list rather than an error, and a reload keeps the old
 * rows on screen until the new ones land - the table is behind an open dialog
 * when a save triggers one.
 */
export function useTemplates(target: string, language: LanguageCode): State {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<Failed | null>(null)
  const [nonce, setNonce] = useState(0)

  const token = `${target}:${language}`

  useEffect(() => {
    let cancelled = false
    const current = `${target}:${language}`

    fetchTemplates(target, language)
      .then((response) => {
        if (!cancelled) {
          setLoaded({ token: current, templates: response.templates })
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

  const templates = loaded?.token === token ? loaded.templates : null
  const error = failed?.token === token ? failed.message : null

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    templates: templates ?? [],
    isLoading: !templates && !error,
    error,
    reload,
  }
}
