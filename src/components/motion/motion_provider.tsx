import type { ReactNode } from "react"
import { MotionConfig } from "motion/react"

import { transitions } from "@/lib/motion"

/**
 * Wraps the app once so every `motion` element inherits the same default
 * transition, and so `prefers-reduced-motion: reduce` disables transforms
 * app-wide without a single component having to check for it.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transitions.base}>
      {children}
    </MotionConfig>
  )
}
