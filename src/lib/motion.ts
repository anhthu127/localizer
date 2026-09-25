import type { Transition, Variants } from "motion/react"

/**
 * The app's one motion vocabulary. Every animation picks a transition and a
 * variant from here rather than inventing its own numbers, so the whole UI
 * accelerates and settles the same way.
 *
 * Reduced motion is not handled per animation - `MotionProvider` sets
 * `reducedMotion="user"` once, and Motion then drops transforms for anyone who
 * asked their OS for less movement, keeping opacity only.
 */

/** Standard ease-out: quick to start, long to settle. */
export const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const transitions = {
  /** Hover, press, icon swaps - has to feel instant. */
  fast: { duration: 0.15, ease: easeOut },
  /** The default: entrances, fades, list items. */
  base: { duration: 0.28, ease: easeOut },
  /** Page-level entrances. */
  slow: { duration: 0.42, ease: easeOut },
  /** Anything that follows a gesture or a layout change. */
  spring: { type: "spring", stiffness: 380, damping: 32, mass: 0.7 },
} satisfies Record<string, Transition>

/** How far a element travels on entry, in px. Small on purpose. */
const RISE = 8

/** Fade up - the entrance for a single block of content. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: RISE },
  visible: { opacity: 1, y: 0, transition: transitions.base },
}

/** Fade only - for content that must not shift, like a table row. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.base },
}

/**
 * A parent that deals its children in one by one. The stagger is short enough
 * that a 12-tile grid finishes well inside half a second.
 */
export const staggerContainer = (stagger = 0.04, delay = 0): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
})

/** The child of a `staggerContainer`. */
export const staggerItem: Variants = fadeInUp

/** The page swap in `AppLayout`. */
export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transitions.slow },
}

/** A bar that slides in from the bottom edge - the unsaved-changes tray. */
export const slideUpBar: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: transitions.spring },
  exit: { opacity: 0, y: 24, transition: transitions.fast },
}
