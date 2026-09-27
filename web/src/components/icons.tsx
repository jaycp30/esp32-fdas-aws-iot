/**
 * Hand-drawn icon set for FDAS Monitoring.
 *
 * The house style bans generic thin-line icon packs (Feather/Lucide/
 * Heroicons), so every icon here is a small bespoke SVG. All of them take
 * `currentColor` for their fill/stroke, so the calling component controls
 * colour with an ordinary Tailwind text-* class - the icon never hardcodes
 * a status colour itself.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/** App bar mark - a simple shield, standing in for "protection/monitoring". */
export function ShieldIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.5 4.5 5.4v5.3c0 5 3.2 8.6 7.5 10.8 4.3-2.2 7.5-5.8 7.5-10.8V5.4L12 2.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Overflow ("more actions") trigger - three solid dots, vertical. */
export function KebabIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  )
}

/** NORMAL - a plain check, quiet and unambiguous. */
export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 12.5 9.5 17 19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** ALARM - a filled triangle with an exclamation mark; the static fallback
 *  frame used when a Lottie animation can't/shouldn't play. */
export function AlarmTriangleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3.5 22 20.5H2L12 3.5Z" fill="currentColor" />
      <rect x="11" y="10" width="2" height="5.5" rx="1" fill="white" />
      <circle cx="12" cy="17.5" r="1.15" fill="white" />
    </svg>
  )
}

/** TROUBLE / ACTIVE (monitor) - a filled diamond with an exclamation mark;
 *  distinct silhouette from the alarm triangle so the shape alone (not just
 *  colour) tells the two apart. */
export function TroubleDiamondIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5Z" fill="currentColor" />
      <rect x="11" y="8" width="2" height="6" rx="1" fill="white" />
      <circle cx="12" cy="16.5" r="1.1" fill="white" />
    </svg>
  )
}

/** UNKNOWN - a dashed circle with a question mark: "we don't actually know". */
export function UnknownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="3.2 3.2"
      />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
        ?
      </text>
    </svg>
  )
}

/** Static fallback for the offline connection chip / banner. */
export function PlugOffIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path
        d="M8 8.5 16 15.5M16 8.5 8 15.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Static fallback dot for the "live" heartbeat chip. */
export function DotIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="6" fill="currentColor" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 6 18 18M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
