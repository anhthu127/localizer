import type { ComponentProps, ReactNode } from "react"
import { motion } from "motion/react"

import { fadeInUp } from "@/lib/motion"

type FadeInProps = {
  children: ReactNode
  className?: string
  /** Seconds to wait before starting — for hand-ordering a few blocks. */
  delay?: number
} & Omit<ComponentProps<typeof motion.div>, "variants" | "initial" | "animate">

/** One block of content, faded and lifted into place on mount. */
export function FadeIn({ children, className, delay = 0, ...rest }: FadeInProps) {
  return (
    <motion.div
      className={className}
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
