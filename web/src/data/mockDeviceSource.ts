/**
 * Mock stand-in for the real telemetry source.
 *
 * This module simulates the ESP32 Smart Input Module "phoning home" with a
 * fresh reading on a steady interval, the way it will over AWS IoT Core once
 * that integration exists. It exposes exactly the shape a real source would:
 * `subscribe(listener)` for pushing new samples, and nothing else public.
 *
 * Swapping to the real thing later means writing a new module with the same
 * `subscribe` signature (backed by an Amplify Data subscription or an IoT
 * MQTT topic) and changing ONE import in useZoneFeed.ts - no component in
 * src/components ever imports this file directly.
 */
import { MOCK_HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from './constants'
import { SCENARIO_CHANNELS } from './scenarios'
import type { DeviceSample, ScenarioId } from '../types/zone'

type Listener = (sample: DeviceSample) => void

const listeners = new Set<Listener>()
let currentScenario: ScenarioId = 'all-normal'
let lastSample: DeviceSample | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/** How far in the past to backdate the "offline" scenario's one sample, so
 *  picking it in the demo menu shows OFFLINE immediately instead of making
 *  whoever is watching the demo wait out the real 90s timeout. This reuses
 *  the same staleness threshold the derivation layer checks against, so the
 *  demo is exercising the real rule, not a separate hardcoded shortcut. */
const OFFLINE_DEMO_MARGIN_MS = 15_000

function publish(receivedAt: number) {
  const sample: DeviceSample = {
    receivedAt,
    channels: SCENARIO_CHANNELS[currentScenario],
  }
  lastSample = sample
  for (const listener of listeners) listener(sample)
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/** Selects a demo scenario and (re)starts the simulated publish cadence. */
export function setScenario(id: ScenarioId): void {
  currentScenario = id
  stopHeartbeat()

  if (id === 'offline') {
    // A module that has actually dropped off the network stops publishing
    // altogether - it does not send an "I'm offline" message. We model that
    // by publishing one sample whose timestamp is already older than the
    // heartbeat timeout, then simply never publishing again.
    publish(Date.now() - HEARTBEAT_TIMEOUT_MS - OFFLINE_DEMO_MARGIN_MS)
    return
  }

  publish(Date.now())
  heartbeatTimer = setInterval(() => publish(Date.now()), MOCK_HEARTBEAT_INTERVAL_MS)
}

/**
 * Subscribes to the mock feed. The listener is called immediately with the
 * current sample (if one exists yet) and again on every subsequent publish.
 * Returns an unsubscribe function, matching the convention a real
 * IoT/Amplify Data subscription would also use.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)

  // Lazily start the simulated device the first time anything subscribes,
  // rather than as an import-time side effect - a real subscription would
  // only open its connection once something actually needs the data too.
  if (lastSample === null) {
    setScenario(currentScenario)
  } else {
    listener(lastSample)
  }

  return () => {
    listeners.delete(listener)
  }
}

export function getCurrentScenario(): ScenarioId {
  return currentScenario
}
