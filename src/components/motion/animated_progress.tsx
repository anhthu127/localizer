import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { motion, useReducedMotion } from "motion/react"

import { ProgressTrack } from "@/components/ui/progress"
import { easeOut } from "@/lib/motion"
import { cn } from "@/lib/utils"

type AnimatedProgressProps = {
  value: number
  className?: string
}

/**
 * The shadcn `Progress`, grown from zero on mount rather than painted full.
 *
 * It composes the Base UI root and the design system's track so the bar keeps
 * its `progressbar` role and its ARIA values — only the indicator is swapped
 * for a motion element, because a width cannot be tweened from a stylesheet
 * without React state in between.
 */
export function AnimatedProgress({ value, className }: AnimatedProgressProps) {
  const prefersReducedMotion = useReducedMotion()
  const width = `${Math.max(0, Math.min(100, value))}%`

  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
    >
      <ProgressTrack>
        <motion.div
          data-slot="progress-indicator"
          className="bg-primary h-full rounded-full"
          initial={{ width: prefersReducedMotion ? width : 0 }}
          animate={{ width }}
          transition={{ duration: 0.7, ease: easeOut }}
        />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}
