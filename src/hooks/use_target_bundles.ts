import { useEffect, useState } from "react"

import { fetchEntries, messageOf } from "@/lib/api"
import type { LanguageCode, TranslationRow } from "@/lib/locale_data"

type Held = {
  target: string
  rows: Map<LanguageCode, TranslationRow[]>
}

type State = {
  /** One entry per language that has arrived; absent means still on its way. */
  rows: ReadonlyMap<LanguageCode, TranslationRow[]>
  isLoading: boolean
  error: string | null
}

/**
 * One app's keys in *several* languages at once — what the import wizard needs
 * and `use_translation_rows.ts` deliberately does not do.
 *
 * The workspace reads one language because a reader reads one language. An
 * import is a delivery: a dozen files arrive together, each for a different
 * language, and every one has to be diffed against what the app holds for
 * *its* language before any of them is written.
 *
 * Languages already held are not fetched again. Adding a thirteenth file to a
 * dozen costs one request, not thirteen — a bundle is around a megabyte, and
 * the wizard re-renders every time a language select changes.
 */
export function useTargetBundles(
  target: string,
  codes: LanguageCode[]
): State {
  const [held, setHeld] = useState<Held>(() => ({ target, rows: new Map() }))
  const [error, setError] = useState<string | null>(null)

  // Adjusted during render rather than in an effect: what was read about the
  // previous app is not an answer about this one, and rendering it for a frame
  // before an effect clears it would show the wrong app's values under the
  // right app's name.
  if (held.target !== target) {
    setHeld({ target, rows: new Map() })
    setError(null)
  }

  // The effect wants the set of languages, not the array identity the caller
  // rebuilds on every render.
  const wanted = codes.join(",")

  useEffect(() => {
    if (!target) {
      return
    }

    // Read from `held`, which the effect also depends on, so a merge re-runs
    // it and it finds nothing missing. Reading a stale `held` can only name
    // too many languages, never too few, so the worst case is a wasted GET.
    const missing = codes.filter((code) => !held.rows.has(code))
    if (missing.length === 0) {
      return
    }

    let cancelled = false

    Promise.all(
      missing.map((code) =>
        fetchEntries(target, code).then(
          (response) => [code, response.entries] as const
        )
      )
    )
      .then((loaded) => {
        if (cancelled) {
          return
        }
        setHeld((current) => {
          // The app changed while these were in flight; they answer about an
          // app the wizard is no longer importing into.
          if (current.target !== target) {
            return current
          }
          const rows = new Map(current.rows)
          for (const [code, entries] of loaded) {
            rows.set(code, entries)
          }
          return { target, rows }
        })
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(messageOf(cause))
        }
      })

    return () => {
      cancelled = true
    }
    // `wanted` stands in for `codes`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, wanted, held])

  return {
    rows: held.target === target ? held.rows : EMPTY,
    // Derived rather than tracked, the same way `use_translation_rows.ts`
    // derives it: a language is loading exactly while it is still missing.
    isLoading:
      target !== "" &&
      error === null &&
      codes.some((code) => !held.rows.has(code)),
    error,
  }
}

const EMPTY: ReadonlyMap<LanguageCode, TranslationRow[]> = new Map()
