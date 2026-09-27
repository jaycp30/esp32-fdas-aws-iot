import { AlarmTriangleIcon } from './icons'

/**
 * The top-of-page fire alarm summary, e.g. "FIRE ALARM - Zone 02". Only
 * rendered while `summary` is non-null (App.tsx decides that from
 * useZoneFeed's hasActiveAlarm). Solid, high-contrast red - this is the one
 * moment the app should look urgent.
 */
export function AlarmBanner({ summary }: { summary: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-alarm bg-alarm px-4 py-3 text-white sm:px-5">
      <AlarmTriangleIcon className="h-6 w-6 shrink-0" />
      <p className="text-sm font-bold tracking-wide sm:text-base">{summary}</p>
    </div>
  )
}
