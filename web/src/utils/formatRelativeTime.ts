/**
 * Formats a past epoch-ms timestamp as a short relative string ("just now",
 * "12s ago", "3m ago"). Used for both the "Last update" caption and the
 * offline banner's "Last contact" line, so the two always agree - they read
 * the same underlying timestamp (see useZoneFeed).
 */
export function formatRelativeTime(pastMs: number, nowMs: number): string {
  const deltaSeconds = Math.max(0, Math.round((nowMs - pastMs) / 1000))

  if (deltaSeconds < 5) return 'just now'
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`

  const deltaMinutes = Math.floor(deltaSeconds / 60)
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  const deltaDays = Math.floor(deltaHours / 24)
  return `${deltaDays}d ago`
}
