import { useCallback, useEffect, useState } from "react"

import { fetchCoverage, messageOf } from "@/lib/api"
import type { CoverageResponse } from "@/lib/api_types"

type State = {
  coverage: CoverageResponse | null
  isLoading: boolean
  error: string | null
  reload: () => void
}

/**
 * Dashboard totals from `GET /api/coverage`.
 *
 * These used to be a generated module, because counting meant loading all 13
 * bundles into the browser. The server holds the files, so it counts them —
 * and the numbers move when a key is added.
 */
export function useCoverage(): State {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetchCoverage()
      .then((response) => {
        if (!cancelled) {
          setCoverage(response)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(messageOf(cause))
        }
      })

    return () => {
      cancelled = true
    }
  }, [nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    coverage,
    isLoading: !coverage && !error,
    error,
    reload,
  }
}
