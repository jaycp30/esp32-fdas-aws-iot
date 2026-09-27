/**
 * The small persistent connectivity indicator near the top of the page.
 * Deliberately reuses the app's existing green/grey status vocabulary
 * (green = healthy, grey = unknown/offline) instead of introducing a new
 * "connected" colour, so the palette stays as small as the brief asks.
 */
import heartbeat from '../lottie/heartbeat.json'
import offlinePulse from '../lottie/offlinePulse.json'
import { DotIcon, PlugOffIcon } from './icons'
import { StatusMotion } from './StatusMotion'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import type { ConnectivityState } from '../types/zone'

interface ConnectionChipProps {
  connectivityState: ConnectivityState
  lastContactAt: number | null
  now: number
}

/** CONNECTING and VIEWER_DISCONNECTED both reuse the same neutral grey
 *  "offline" styling as DEVICE_OFFLINE (see the shared className below) -
 *  none of the three is an alarm, so none of them should look like one.
 *  Only the label text differs. */
const CONNECTIVITY_LABEL: Record<ConnectivityState, string> = {
  ONLINE: 'ONLINE',
  CONNECTING: 'CONNECTING',
  VIEWER_DISCONNECTED: 'DISCONNECTED',
  DEVICE_OFFLINE: 'OFFLINE',
}

export function ConnectionChip({ connectivityState, lastContactAt, now }: ConnectionChipProps) {
  const isOnline = connectivityState === 'ONLINE'
  const relativeTime = lastContactAt === null ? 'no contact yet' : formatRelativeTime(lastContactAt, now)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
        isOnline ? 'border-normal/30 bg-normal-tint text-normal' : 'border-line bg-offline-tint text-offline'
      }`}
    >
      {isOnline ? (
        <StatusMotion animationData={heartbeat} className="h-3 w-3" fallback={<DotIcon className="h-3 w-3" />} />
      ) : (
        <StatusMotion
          animationData={offlinePulse}
          className="h-3.5 w-3.5"
          fallback={<PlugOffIcon className="h-3.5 w-3.5" />}
        />
      )}
      <span>{CONNECTIVITY_LABEL[connectivityState]}</span>
      {/* text-ink-soft rather than a translucent version of the status
          colour: lowering opacity on #1E6B3A/#4B4B4B over these tints drops
          the smaller mono text below the 4.5:1 floor (measured ~3.85:1 for
          the online chip) - a solid, already-verified colour keeps every
          size of text compliant instead of only the larger label next to it. */}
      <span className="font-mono font-normal text-[11px] text-ink-soft">{relativeTime}</span>
    </span>
  )
}
