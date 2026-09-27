import type { Announcement } from '../types/zone'

/**
 * Two permanent, visually-hidden aria-live regions: "polite" for ordinary
 * status changes (connectivity, trouble, recovery) and "assertive" for a
 * brand-new fire alarm, per the brief. Both regions must exist in the DOM
 * from first render - a region created *after* the content it should
 * announce is too late for most screen readers to pick up.
 *
 * useZoneFeed already decides which region each announcement belongs to, so
 * this component only has to render them. Re-keying the inner <span> on
 * every announcement (even a repeated message) forces a real DOM mutation,
 * which is what actually triggers a screen reader to speak an aria-live
 * region again.
 */
export function LiveRegions({
  polite,
  assertive,
}: {
  polite: Announcement | null
  assertive: Announcement | null
}) {
  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        <span key={polite?.key ?? 'initial-polite'}>{polite?.message}</span>
      </div>
      <div aria-live="assertive" role="alert" className="sr-only">
        <span key={assertive?.key ?? 'initial-assertive'}>{assertive?.message}</span>
      </div>
    </>
  )
}
