/**
 * The "Demo" scenario switcher, opened from the app bar's overflow menu.
 *
 * This is a MOCKUP-ONLY control - it stands in for telemetry that will
 * eventually arrive from AWS IoT Core - so it is deliberately styled to look
 * like developer tooling (monospace label, dashed divider) rather than a
 * normal product feature, and is clearly labelled "DEMO" throughout so
 * nobody mistakes it for something that will ship.
 *
 * Implemented as an accessible bottom sheet: focus moves into it on open,
 * Escape and the backdrop both close it, and focus returns to the app bar's
 * menu button on close.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { CheckIcon, CloseIcon } from './icons'
import { SCENARIOS } from '../data/scenarios'
import type { ScenarioId } from '../types/zone'

interface DemoMenuProps {
  isOpen: boolean
  onClose: () => void
  scenario: ScenarioId
  onSelectScenario: (id: ScenarioId) => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

export function DemoMenu({ isOpen, onClose, scenario, onSelectScenario, returnFocusRef }: DemoMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Move focus into the sheet on open, and give it back to the button that
  // opened it on close - a modal that eats focus permanently traps keyboard
  // and screen-reader users inside it.
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus()
    } else {
      returnFocusRef.current?.focus()
    }
  }, [isOpen, returnFocusRef])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-menu-heading"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-5 shadow-none outline-none sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 sm:rounded-2xl sm:border"
      >
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-3">
          <div>
            <p
              id="demo-menu-heading"
              className="font-mono text-xs font-semibold tracking-[0.14em] text-ink-soft uppercase"
            >
              Demo &mdash; scenario
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Switches the mock feed. Nothing here reaches real hardware.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-surface-muted"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <fieldset className="mt-3 flex flex-col gap-2">
          <legend className="sr-only">Demo scenario</legend>
          {SCENARIOS.map((option) => {
            const selected = option.id === scenario
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectScenario(option.id)}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                  selected ? 'border-ink bg-surface-muted' : 'border-line hover:bg-surface-muted'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-ink bg-ink text-white' : 'border-line text-transparent'
                  }`}
                >
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="block text-xs text-ink-soft">{option.description}</span>
                </span>
              </button>
            )
          })}
        </fieldset>
      </div>
    </div>
  )
}
