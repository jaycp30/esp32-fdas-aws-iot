import offlinePulse from '../lottie/offlinePulse.json'
import { PlugOffIcon } from './icons'
import { StatusMotion } from './StatusMotion'
import { formatRelativeTime } from '../utils/formatRelativeTime'

/**
 * The "we genuinely don't know what the panel is doing" banner. Shown
 * whenever the device is OFFLINE, i.e. whenever the staleness rule in
 * data/deriveDeviceState.ts has fired. Deliberately styled in dark
 * charcoal/grey rather than red or amber - offline is not itself an alarm,
 * and dressing it as one would blur the one colour that must mean "fire".
 */
export function OfflineBanner({ lastContactAt, now }: { lastContactAt: number | null; now: number }) {
  const relativeTime = lastContactAt === null ? 'no contact yet' : formatRelativeTime(lastContactAt, now)

  return (
    <div className="flex items-start gap-3 rounded-xl border border-offline-strong bg-offline-strong px-4 py-3 text-white sm:px-5">
      <StatusMotion
        animationData={offlinePulse}
        className="mt-0.5 h-6 w-6 shrink-0"
        fallback={<PlugOffIcon className="mt-0.5 h-6 w-6 shrink-0" />}
      />
      <div className="min-w-0">
        <p className="text-sm font-bold sm:text-base">
          Input module offline &mdash; zone states unknown. Check the FDAS panel directly.
        </p>
        <p className="mt-1 font-mono text-xs text-white/80">Last contact: {relativeTime}</p>
      </div>
    </div>
  )
}
