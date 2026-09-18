import type { ComponentProps, ReactNode } from "react"
import { motion } from "motion/react"

import { transitions } from "@/lib/motion"

type LiftProps = {
  children: ReactNode
  className?: string
  /** How far the card rises on hover, in px. */
  distance?: number
} & Omit<ComponentProps<typeof motion.div>, "whileHover" | "whileTap">

/**
 * The hover affordance for anything clickable and card-shaped: it rises a
 * little under the pointer and presses back down on click. Pure transform, so
 * it never reflows the grid it sits in.
 */
export function Lift({ children, className, distance = 3, ...rest }: LiftProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -distance }}
      whileTap={{ scale: 0.985 }}
      transition={transitions.spring}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
