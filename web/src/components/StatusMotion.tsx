/**
 * Wraps a small looping Lottie animation with a reduced-motion fallback.
 *
 * Every animation in this app is decorative: the alarm ring, the heartbeat
 * dot and the offline pulse each repeat information the status icon + text
 * label already convey (see components/icons.tsx and the ZoneCard status
 * labels). Per the project's motion rules, decorative motion should be fully
 * opted out of for `prefers-reduced-motion`, not played "a bit slower" - so
 * when that preference is set we render the supplied static icon frame
 * instead of mounting the Lottie player at all.
 *
 * We use lottie-react's `LottieLight` build rather than the default `Lottie`
 * export: none of our JSON files use expressions, so the lighter engine
 * (no expression evaluator, svg-only renderer) is the correct/smaller choice
 * for this app - see the README for the full dependency justification.
 */
import type { ReactNode } from 'react'
import { LottieLight } from 'lottie-react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

interface StatusMotionProps {
  /** Parsed Lottie JSON (imported directly - see src/lottie/*.json). */
  animationData: object
  /** Static icon shown instead, when reduced motion is preferred. */
  fallback: ReactNode
  className?: string
}

export function StatusMotion({ animationData, fallback, className }: StatusMotionProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  if (prefersReducedMotion) {
    return (
      <span className={className} aria-hidden="true">
        {fallback}
      </span>
    )
  }

  return <LottieLight src={animationData} loop autoplay className={className} aria-hidden="true" />
}
