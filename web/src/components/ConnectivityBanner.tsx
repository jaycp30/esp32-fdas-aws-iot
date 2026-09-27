import offlinePulse from '../lottie/offlinePulse.json'
import { PlugOffIcon } from './icons'
import { StatusMotion } from './StatusMotion'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import type { ConnectivityState } from '../types/zone'

type NonOnlineState = Exclude<ConnectivityState, 'ONLINE'>

interface ConnectivityBannerProps {
  connectivityState: NonOnlineState
  lastContactAt: number | null
  now: number
  /** C3's "Last reported alarms: Zone 02" line, or null when there's
   *  nothing to report (e.g. still CONNECTING, or nothing has ever
   *  alarmed). */
  lastReportedAlarmSummary: string | null
}

/**
 * Copy for the three non-ONLINE states this banner covers - see
 * hooks/useZoneFeed.ts's ConnectivityState and data/deriveDeviceState.ts's
 * deriveConnectivityState for how the app decides which one is active.
 * CONNECTING has no "last contact" line: by definition, nothing has ever
 * arrived yet, so there's nothing to report a time for.
 */
const COPY: Record<NonOnlineState, { headline: string; showLastContact: boolean }> = {
  CONNECTING: {
    headline: 'Connecting to monitoring service…',
    showLastContact: false,
  },
  VIEWER_DISCONNECTED: {
    headline: 'Connection to monitoring service lost — zone states unknown. Check the FDAS panel directly.',
    showLastContact: true,
  },
  DEVICE_OFFLINE: {
    headline: 'Input module offline — zone states unknown. Check the FDAS panel directly.',
    showLastContact: true,
  },
}

/**
 * The "we genuinely don't know what the panel is doing" banner. Shown for
 * any of the three ConnectivityStates other than ONLINE - the device being
 * offline/stale, OUR OWN connection to AWS IoT having dropped, or the page
 * still waiting for its first sample. Deliberately styled in dark
 * charcoal/grey rather than red or amber for all three: none of them is
 * itself an alarm, and dressing any of them as one would blur the one
 * colour that must mean "fire" (see ZoneCard.tsx's ALARM treatment).
 *
 * (Previously named OfflineBanner - renamed when VIEWER_DISCONNECTED and
 * CONNECTING were added, since by then "offline" no longer described two
 * of its three states.)
 */
export function ConnectivityBanner({
  connectivityState,
  lastContactAt,
  now,
  lastReportedAlarmSummary,
}: ConnectivityBannerProps) {
  const { headline, showLastContact } = COPY[connectivityState]
  const relativeTime = lastContactAt === null ? 'no contact yet' : formatRelativeTime(lastContactAt, now)

  return (
    <div className="flex items-start gap-3 rounded-xl border border-offline-strong bg-offline-strong px-4 py-3 text-white sm:px-5">
      <StatusMotion
        animationData={offlinePulse}
        className="mt-0.5 h-6 w-6 shrink-0"
        fallback={<PlugOffIcon className="mt-0.5 h-6 w-6 shrink-0" />}
      />
      <div className="min-w-0">
        <p className="text-sm font-bold sm:text-base">{headline}</p>
        {showLastContact && <p className="mt-1 font-mono text-xs text-white/80">Last contact: {relativeTime}</p>}
        {/* C3's summary line, kept OUT of the top red AlarmBanner on
            purpose - see App.tsx's comment on why the two banners can
            never both be visible at once. */}
        {lastReportedAlarmSummary && <p className="mt-1 text-sm font-semibold text-white">{lastReportedAlarmSummary}</p>}
      </div>
    </div>
  )
}
