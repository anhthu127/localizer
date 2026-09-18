import { useEffect } from "react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react"

import { easeOut } from "@/lib/motion"

type AnimatedNumberProps = {
  /** Null while the number is still loading — renders `fallback` instead. */
  value: number | null
  className?: string
  /** Shown until `value` arrives. */
  fallback?: string
  /** Seconds the count-up takes. */
  duration?: number
}

/**
 * Counts up to `value` instead of snapping to it. The tween runs on a motion
 * value rather than React state, so the count never re-renders the tree — and
 * it is skipped outright for anyone who asked for reduced motion.
 */
export function AnimatedNumber({
  value,
  className,
  fallback = "—",
  duration = 0.9,
}: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion()
  const count = useMotionValue(0)
  const text = useTransform(count, (latest) =>
    Math.round(latest).toLocaleString()
  )

  useEffect(() => {
    if (value === null) return

    if (prefersReducedMotion) {
      count.set(value)
      return
    }

    const controls = animate(count, value, { duration, ease: easeOut })
    return () => controls.stop()
  }, [value, prefersReducedMotion, count, duration])

  if (value === null) return <span className={className}>{fallback}</span>

  return <motion.span className={className}>{text}</motion.span>
}
