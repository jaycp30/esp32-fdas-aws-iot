/**
 * One row in the zone list: a round badge, the channel's fixed label, and
 * its current status as an icon + coloured text (never colour alone, per
 * the project's life-safety rules).
 *
 * IMPORTANT: this component only ever renders the ChannelViewModel it is
 * given. It has no idea what "should" happen next, and it never re-sorts,
 * hides, or reorders itself relative to its siblings - see ZoneList.tsx for
 * why the fixed physical order matters.
 */
import alarmPulse from '../lottie/alarmPulse.json'
import { AlarmTriangleIcon, CheckIcon, TroubleDiamondIcon, UnknownIcon } from './icons'
import { StatusMotion } from './StatusMotion'
import type { ChannelViewModel, DisplayState } from '../types/zone'

interface StatusTreatment {
  /** Text shown next to the icon. Distinct from the raw DisplayState so we
   *  can keep ALARM's word ("ALARM") different from a friendlier one later
   *  without touching the type. */
  statusLabel: string
  /** Classes for the outer card: background, border and status text colour
   *  (the status line inherits this colour; see the JSX below). */
  card: string
  /** Colour for the "ZONE 0N" / "MONITOR" heading line. Kept separate from
   *  `card`'s colour because that one belongs to the status line - the two
   *  only match by coincidence on the light cards and must NOT match on the
   *  solid-red alarm card, where the heading also has to turn white. */
  label: string
  /** Classes for the round badge behind the zone number/letter. */
  badge: string
  Icon: typeof CheckIcon
}

const TREATMENTS: Record<DisplayState, StatusTreatment> = {
  NORMAL: {
    statusLabel: 'NORMAL',
    card: 'border-line bg-surface text-normal',
    label: 'text-ink',
    badge: 'bg-surface-muted text-ink border border-line',
    Icon: CheckIcon,
  },
  ALARM: {
    statusLabel: 'ALARM',
    card: 'border-alarm bg-alarm text-white',
    label: 'text-white',
    badge: 'bg-white text-alarm',
    Icon: AlarmTriangleIcon,
  },
  TROUBLE: {
    statusLabel: 'TROUBLE',
    card: 'border-trouble/40 bg-trouble-tint text-trouble',
    label: 'text-ink',
    badge: 'bg-surface text-trouble border border-trouble/40',
    Icon: TroubleDiamondIcon,
  },
  ACTIVE: {
    statusLabel: 'ACTIVE',
    card: 'border-trouble/40 bg-trouble-tint text-trouble',
    label: 'text-ink',
    badge: 'bg-surface text-trouble border border-trouble/40',
    Icon: TroubleDiamondIcon,
  },
  UNKNOWN: {
    statusLabel: 'UNKNOWN',
    card: 'border-line bg-offline-tint text-offline',
    label: 'text-ink',
    badge: 'bg-surface text-offline border border-line',
    Icon: UnknownIcon,
  },
}

export function ZoneCard({ channel }: { channel: ChannelViewModel }) {
  const treatment = TREATMENTS[channel.state]
  const isAlarm = channel.state === 'ALARM'

  return (
    <li
      className={`flex items-center gap-4 rounded-xl border p-4 transition-colors duration-300 sm:p-5 ${treatment.card}`}
    >
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        {isAlarm && (
          <StatusMotion
            animationData={alarmPulse}
            className="absolute inset-0 h-14 w-14"
            fallback={<span className="absolute inset-0 rounded-full border-2 border-white/50" />}
          />
        )}
        <span
          aria-hidden="true"
          className={`relative flex h-10 w-10 items-center justify-center rounded-full font-mono text-base font-semibold ${treatment.badge}`}
        >
          {channel.badge}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold tracking-wide sm:text-base ${treatment.label}`}>
          {channel.label}
        </p>
        {/* No colour class here on purpose: this line inherits the <li>'s
            text colour, which `treatment.card` already sets to the exact
            status colour - one fewer place that colour could drift. */}
        <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
          <treatment.Icon className="h-4 w-4 shrink-0" />
          <span>{treatment.statusLabel}</span>
        </p>
      </div>
    </li>
  )
}
