/**
 * The small pill-shaped section label above the zone list ("ZONES ALARM
 * INDICATOR" in the reference layout). This is the one place a fully round
 * pill is appropriate under the house style: it's a small label/tag, not a
 * large container.
 */
export function SectionPill({ children }: { children: string }) {
  return (
    <div className="flex justify-center">
      <h2 className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold tracking-[0.14em] text-white uppercase">
        {children}
      </h2>
    </div>
  )
}
