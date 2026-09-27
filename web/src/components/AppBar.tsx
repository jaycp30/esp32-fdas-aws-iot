import type { Ref } from 'react'
import { KebabIcon, ShieldIcon } from './icons'

interface AppBarProps {
  onOpenMenu: () => void
  menuButtonRef: Ref<HTMLButtonElement>
}

/**
 * Top app bar: shield mark, product name, and the overflow menu that opens
 * the Demo scenario switcher (see DemoMenu.tsx). `backdrop-blur` on the bar
 * itself is the one glassmorphism-adjacent effect the house style allows
 * ("subtle navbar blurs").
 */
export function AppBar({ onOpenMenu, menuButtonRef }: AppBarProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-2">
        <ShieldIcon className="h-6 w-6 text-ink" />
        <h1 className="text-sm font-bold tracking-[0.12em] text-ink sm:text-base">FDAS MONITORING</h1>
      </div>
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
    </header>
  )
}
