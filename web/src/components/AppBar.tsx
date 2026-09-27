import type { Ref } from 'react'
import { KebabIcon, ShieldIcon } from './icons'

interface AppBarProps {
  onOpenMenu: () => void
  menuButtonRef: Ref<HTMLButtonElement>
  /** True only under `?demo=1`. Live is the default and has no scenario
   *  switcher to open, so the overflow menu button - and this label -
   *  only exist in demo mode. See hooks/useZoneFeed.ts. */
  isDemoMode: boolean
}

/**
 * Top app bar: shield mark, product name, and (demo mode only) the
 * overflow menu that opens the Demo scenario switcher (see DemoMenu.tsx)
 * plus a small "DEMO" label so simulated data is never mistaken for live
 * telemetry. `backdrop-blur` on the bar itself is the one
 * glassmorphism-adjacent effect the house style allows ("subtle navbar
 * blurs").
 */
export function AppBar({ onOpenMenu, menuButtonRef, isDemoMode }: AppBarProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-sm sm:px-6">
      {/* flex-wrap (not truncate) on the title row: on a narrow phone,
          "FDAS MONITORING" plus the demo badge plus the menu button don't
          all fit on one line - wrapping the badge onto its own line keeps
          the product name fully readable, rather than cutting it off. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex shrink-0 items-center gap-2">
          <ShieldIcon className="h-6 w-6 shrink-0 text-ink" />
          <h1 className="text-sm font-bold tracking-[0.12em] whitespace-nowrap text-ink sm:text-base">
            FDAS MONITORING
          </h1>
        </div>
        {isDemoMode && (
          <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.1em] text-white uppercase">
            Demo — simulated data
          </span>
        )}
      </div>
      {isDemoMode && (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMenu}
          aria-haspopup="dialog"
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-surface-muted"
        >
          <KebabIcon className="h-5 w-5" />
        </button>
      )}
    </header>
  )
}
