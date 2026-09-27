import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Tracks the OS/browser "reduce motion" preference live, so switching it in
 * dev tools or system settings updates the app without a reload. All of our
 * Lottie usage is decorative (a status pulse that repeats information the
 * icon + text label already convey), so per the project's motion rules we
 * fully opt out of it when this is true, rather than playing a "quieter"
 * version - see components/StatusMotion.tsx.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY)
    const handleChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersReduced
}
