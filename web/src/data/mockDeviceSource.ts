/**
 * Mock stand-in for the real telemetry source, active only under `?demo=1`
 * (see hooks/useZoneFeed.ts, which picks between this module and
 * data/liveDeviceSource.ts). It simulates the ESP32 Smart Input Module
 * "phoning home" with a fresh reading on a steady interval, the way it
 * really does over AWS IoT Core. It exposes exactly the shape the live
 * source also exposes - `subscribe`, `subscribeConnectionPhase`,
 * `subscribeDeviceReportedStatus` - so useZoneFeed can treat the two
 * identically. No component in src/components ever imports this file
 * directly.
 */
import { MOCK_HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from './constants'
import { SCENARIO_CHANNELS } from './scenarios'
import type {
  ConnectionPhase,
  DeviceReportedStatus,
  DeviceSample,
  ScenarioId,
} from '../types/zone'

type Listener = (sample: DeviceSample) => void

const listeners = new Set<Listener>()
let currentScenario: ScenarioId = 'all-normal'
let lastSample: DeviceSample | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/** Scenarios that simulate the module going silent, by backdating a single
 *  sample's `reportedAt` past the staleness threshold instead of starting
 *  a heartbeat - see setScenario below. 'offline-after-alarm' is the same
 *  mechanism as 'offline', just with an alarm reading baked into that one
 *  backdated sample (see scenarios.ts), so it exercises C3's "last
 *  reported ALARM" marker instead of a quiet last reading. */
const OFFLINE_SCENARIOS: ReadonlySet<ScenarioId> = new Set([
  'offline',
  'offline-after-alarm',
])

/** How far in the past to backdate the "offline" scenario's one sample, so
 *  picking it in the demo menu shows OFFLINE immediately instead of making
 *  whoever is watching the demo wait out the real 90s timeout. This reuses
 *  the same staleness threshold the derivation layer checks against, so the
 *  demo is exercising the real rule, not a separate hardcoded shortcut. */
const OFFLINE_DEMO_MARGIN_MS = 15_000

function publish(reportedAt: number) {
  const sample: DeviceSample = {
    reportedAt,
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

  if (OFFLINE_SCENARIOS.has(id)) {
    // A module that has actually dropped off the network stops publishing
    // altogether - it does not send an "I'm offline" message. We model that
    // by publishing one sample whose timestamp is already older than the
    // heartbeat timeout, then simply never publishing again.
    publish(Date.now() - HEARTBEAT_TIMEOUT_MS - OFFLINE_DEMO_MARGIN_MS)
    return
  }

  publish(Date.now())
  heartbeatTimer = setInterval(
    () => publish(Date.now()),
    MOCK_HEARTBEAT_INTERVAL_MS,
  )
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

/**
 * The mock feed has no real socket to lose, and simulates the module going
 * offline purely by backdating a sample's timestamp (see setScenario/
 * OFFLINE_SCENARIOS above) rather than via a distinct "the device told us
 * it's offline" signal. So both of these report one constant value,
 * forever - they exist only so hooks/useZoneFeed.ts can treat this module
 * and data/liveDeviceSource.ts identically.
 */
export function subscribeConnectionPhase(
  listener: (phase: ConnectionPhase) => void,
): () => void {
  listener('connected')
  return () => {}
}

export function subscribeDeviceReportedStatus(
  listener: (status: DeviceReportedStatus) => void,
): () => void {
  listener('unknown')
  return () => {}
}
