import type { ComponentProps, ReactNode } from "react"
import { motion } from "motion/react"

import { staggerContainer, staggerItem } from "@/lib/motion"

type StaggerProps = {
  children: ReactNode
  className?: string
  /** Seconds between two children. */
  stagger?: number
  /** Seconds before the first child starts. */
  delay?: number
} & Omit<ComponentProps<typeof motion.div>, "variants" | "initial" | "animate">

/**
 * Deals its children in one after another. Put it on the grid or the list
 * itself - it keeps the element's own classes, so the layout is unchanged.
 */
export function Stagger({
  children,
  className,
  stagger = 0.04,
  delay = 0,
  ...rest
}: StaggerProps) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer(stagger, delay)}
      initial="hidden"
      animate="visible"
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** A direct child of `Stagger`. Without it, a child animates on its own clock. */
export function StaggerItem({
  children,
  className,
  ...rest
}: {
  children: ReactNode
  className?: string
} & Omit<ComponentProps<typeof motion.div>, "variants">) {
  return (
    <motion.div className={className} variants={staggerItem} {...rest}>
      {children}
    </motion.div>
  )
}
