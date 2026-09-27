/**
 * Real telemetry source: subscribes to the ESP32 Smart Input Module's two
 * MQTT topics over AWS IoT Core, using a guest (unauthenticated) Cognito
 * identity. See docs/mqtt-contract.md for the wire contract (rules
 * C1-C5) and web/amplify/backend.ts for the IAM policy that allows exactly
 * this and nothing else.
 *
 * Exposes the same shape data/mockDeviceSource.ts exposes - subscribe(),
 * subscribeConnectionPhase(), subscribeDeviceReportedStatus() - so
 * hooks/useZoneFeed.ts can treat this module and the mock one identically.
 * See that hook for how it picks between the two based on `?demo=1`.
 */
import { fetchAuthSession } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { CONNECTION_STATE_CHANGE, ConnectionState, PubSub } from '@aws-amplify/pubsub'
import outputs from '../../amplify_outputs.json'
import { CHANNEL_ORDER } from './constants'
import type { ChannelSample, ConnectionPhase, DeviceReportedStatus, DeviceSample } from '../types/zone'

/** Single device for now - see docs/mqtt-contract.md §2 (the
 *  `fdas-iot-ane1-<role>-<nn>` naming scheme). Revisit when a second input
 *  module, or an output/annunciator board, joins AWS IoT. */
const DEVICE_ID = 'fdas-iot-ane1-input-01'
const STATE_TOPIC = `fdas/${DEVICE_ID}/state`
const STATUS_TOPIC = `fdas/${DEVICE_ID}/status`

type SampleListener = (sample: DeviceSample) => void
type ConnectionPhaseListener = (phase: ConnectionPhase) => void
type DeviceReportedStatusListener = (status: DeviceReportedStatus) => void

const sampleListeners = new Set<SampleListener>()
const connectionListeners = new Set<ConnectionPhaseListener>()
const statusListeners = new Set<DeviceReportedStatusListener>()

let lastSample: DeviceSample | null = null
let lastConnectionPhase: ConnectionPhase = 'connecting'
let lastDeviceReportedStatus: DeviceReportedStatus = 'unknown'
let pubsubClient: PubSub | null = null
let startPromise: Promise<void> | null = null

/** The fields contract rule C4 orders snapshots by. */
interface SnapshotOrder {
  ts: number
  uptimeS: number
  seq: number
}

/**
 * Contract rule C4 bookkeeping: the order key of the last snapshot we
 * actually accepted. Kept separately from `lastSample` because the
 * app-level DeviceSample type doesn't carry uptime_s/seq - nothing above
 * this module needs them once dedupe has run.
 */
let lastAccepted: SnapshotOrder | null = null

/** Wait before retrying when the guest login (Cognito) fails at page load. */
const START_RETRY_MS = 10_000

/**
 * The shape we require off the wire for a `state` message. Only the fields
 * this app actually uses are listed here - contract rule C5 ("ignore
 * unknown fields") falls straight out of that: parseStatePayload never
 * looks at, and never copies through, anything not named below.
 */
interface RawStatePayload {
  v: number
  ts: number
  seq: number
  uptime_s: number
  inputs: {
    z1: boolean
    z2: boolean
    z3: boolean
    z4: boolean
    mon: boolean
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validates an unknown value against the §4 state payload shape. Rejects
 * (returns null) rather than throwing on anything malformed, so one bad or
 * unexpected message can never crash the app - the caller just logs and
 * moves on, exactly as if the message had never arrived.
 *
 * - Rejects any `v` other than the literal number 1 (contract: "reject a
 *   major version we don't know" - no coercion of a string "1", no
 *   treating a missing `v` as implicitly 1).
 * - Rejects if `ts`/`seq`/`uptime_s` are missing or not finite numbers, or
 *   if `inputs` is missing any of the five expected booleans.
 * - Silently ignores any extra/unknown top-level or `inputs` fields (C5) -
 *   this function simply never reads them.
 */
export function parseStatePayload(raw: unknown): RawStatePayload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  if (value.v !== 1) return null
  if (!isFiniteNumber(value.ts)) return null
  if (!isFiniteNumber(value.seq)) return null
  if (!isFiniteNumber(value.uptime_s)) return null

  const inputs = value.inputs
  if (typeof inputs !== 'object' || inputs === null) return null
  const i = inputs as Record<string, unknown>
  if (
    typeof i.z1 !== 'boolean' ||
    typeof i.z2 !== 'boolean' ||
    typeof i.z3 !== 'boolean' ||
    typeof i.z4 !== 'boolean' ||
    typeof i.mon !== 'boolean'
  ) {
    return null
  }

  return {
    v: value.v,
    ts: value.ts,
    seq: value.seq,
    uptime_s: value.uptime_s,
    inputs: { z1: i.z1, z2: i.z2, z3: i.z3, z4: i.z4, mon: i.mon },
  }
}

/**
 * Contract rule C4: drop a snapshot that is older than the one already
 * accepted. QoS 1 can redeliver a message, and AWS IoT doesn't guarantee
 * ordering, so a copy from earlier can arrive after a newer one.
 *
 * Order by `ts` FIRST. The device's clock is SNTP-synced before it may
 * publish (contract D1), so ts keeps increasing across reboots. uptime_s
 * and seq restart at every boot, which makes them useless on their own: a
 * late copy from earlier in the same boot has a LOWER uptime_s, exactly
 * like a reboot does. Treating "lower uptime_s" as "reboot, accept it"
 * would let a delayed old "all normal" overwrite a newer ALARM.
 *
 * Within the same ts second, (uptime_s, seq) break the tie. A reboot can't
 * happen inside one second, because boot + Wi-Fi + SNTP take far longer.
 */
export function isNewerSnapshot(candidate: SnapshotOrder, accepted: SnapshotOrder | null): boolean {
  if (accepted === null) return true
  if (candidate.ts !== accepted.ts) return candidate.ts > accepted.ts
  if (candidate.uptimeS !== accepted.uptimeS) return candidate.uptimeS > accepted.uptimeS
  return candidate.seq > accepted.seq
}

function toDeviceSample(payload: RawStatePayload): DeviceSample {
  const channels: ChannelSample[] = CHANNEL_ORDER.map((meta) => {
    const active = payload.inputs[meta.id as keyof RawStatePayload['inputs']]
    return meta.kind === 'zone'
      ? {
          kind: 'zone',
          id: meta.id as 'z1' | 'z2' | 'z3' | 'z4',
          raw: active ? 'alarm' : 'normal',
        }
      : { kind: 'monitor', id: 'mon', raw: active ? 'active' : 'normal' }
  })

  return {
    // C1: reportedAt comes from the PAYLOAD's own clock, never from when
    // this browser happened to receive the message - see the field's own
    // comment in types/zone.ts.
    reportedAt: payload.ts * 1000,
    channels,
  }
}

function handleStateMessage(data: unknown): void {
  const payload = parseStatePayload(data)
  if (payload === null) {
    console.warn('[liveDeviceSource] dropping invalid or unknown-version state payload', data)
    return
  }

  const candidate = {
    ts: payload.ts,
    uptimeS: payload.uptime_s,
    seq: payload.seq,
  }
  if (!isNewerSnapshot(candidate, lastAccepted)) {
    return // C4: duplicate or late QoS 1 redelivery of something we've already shown.
  }
  lastAccepted = candidate

  lastSample = toDeviceSample(payload)
  for (const listener of sampleListeners) listener(lastSample)
}

/**
 * Validates a `status` payload: `{"v":1,"status":"online"|"offline"}`
 * (docs/mqtt-contract.md §3). Same rules as the state payload: reject an
 * unknown version (C5), ignore extra fields, never throw.
 *
 * Why JSON and not bare `online`/`offline` words: @aws-amplify/pubsub runs
 * JSON.parse() on every incoming MQTT message (Providers/MqttOverWS.mjs,
 * `_onMessage`) and silently drops anything that isn't valid JSON. The
 * first firmware sent plain text, which never reached this handler, so the
 * contract and firmware were changed to JSON.
 */
export function parseStatusPayload(raw: unknown): DeviceReportedStatus | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.v !== 1) return null
  if (value.status === 'online' || value.status === 'offline') return value.status
  return null
}

/**
 * Contract rule C2: `offline` on the retained status topic means OFFLINE
 * immediately, without waiting for the 90 s staleness rule (C1). It arrives
 * about 47 s after power loss (the broker's last will), or at once on a
 * clean shutdown. C1 stays the independent backstop if this never arrives.
 */
function handleStatusMessage(data: unknown): void {
  const status = parseStatusPayload(data)
  if (status === null) {
    console.warn('[liveDeviceSource] dropping invalid or unknown-version status payload', data)
    return
  }
  setDeviceReportedStatus(status)
}

/**
 * Maps Amplify's granular MQTT connection states down to the three phases
 * this app cares about. All four "Connected*" states mean the socket is up
 * right now - the "Pending" variants describe an in-progress health check
 * or handshake, not an actual drop. Treating those as "disconnected" would
 * flash the VIEWER DISCONNECTED banner for routine keep-alive churn, which
 * is exactly the kind of flapping HEARTBEAT_TIMEOUT_MS exists to prevent
 * on the device side (see constants.ts) - this app doesn't need a second,
 * twitchier version of that same problem on the viewer side.
 */
export function toConnectionPhase(state: ConnectionState): ConnectionPhase {
  switch (state) {
    case ConnectionState.Connected:
    case ConnectionState.ConnectedPendingDisconnect:
    case ConnectionState.ConnectedPendingKeepAlive:
    case ConnectionState.ConnectedPendingNetwork:
      return 'connected'
    case ConnectionState.Connecting:
      return 'connecting'
    case ConnectionState.ConnectionDisrupted:
    case ConnectionState.ConnectionDisruptedPendingNetwork:
    case ConnectionState.Disconnected:
      return 'disconnected'
    default:
      return 'disconnected'
  }
}

function setConnectionPhase(phase: ConnectionPhase): void {
  lastConnectionPhase = phase
  for (const listener of connectionListeners) listener(phase)
}

function setDeviceReportedStatus(status: DeviceReportedStatus): void {
  lastDeviceReportedStatus = status
  for (const listener of statusListeners) listener(status)
}

/** `crypto.randomUUID()` needs a secure context (https or localhost),
 *  which is what this app always runs under (Amplify Hosting is https;
 *  local dev is http://localhost) - the fallback only guards against an
 *  unexpectedly old browser, not against a non-secure origin. */
function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

async function start(): Promise<void> {
  const endpoint = outputs.custom.iot.endpoint
  const region = outputs.custom.iot.region

  let identityId: string | undefined
  try {
    const session = await fetchAuthSession()
    identityId = session.identityId
  } catch (error) {
    console.warn('[liveDeviceSource] fetchAuthSession failed; retrying', error)
  }

  if (!identityId) {
    // A transient network or Cognito hiccup at page load must not leave the
    // page stuck on "disconnected" until someone reloads it. Show the
    // disconnected state (zones UNKNOWN) and try again shortly.
    setConnectionPhase('disconnected')
    startPromise = null
    setTimeout(ensureStarted, START_RETRY_MS)
    return
  }

  // web/amplify/backend.ts's guest IAM policy only allows connecting as
  // client ID `${identityId}-*`. The random suffix - rather than the bare
  // identity ID - is what lets two browser tabs sharing the same guest
  // identity each keep their own MQTT connection: AWS IoT disconnects
  // whichever client was already using a given client ID the instant a
  // second one connects with that same ID.
  const clientId = `${identityId}-${randomSuffix()}`

  pubsubClient = new PubSub({
    region,
    endpoint: `wss://${endpoint}/mqtt`,
    clientId,
  })

  Hub.listen('pubsub', (data) => {
    const { payload } = data
    if (payload.event !== CONNECTION_STATE_CHANGE) return
    const { connectionState, provider } = payload.data as {
      connectionState: ConnectionState
      provider: unknown
    }
    // Guard against events from a stale client, in case this module is
    // ever re-initialised within the same page load.
    if (provider !== pubsubClient) return
    setConnectionPhase(toConnectionPhase(connectionState))
  })

  pubsubClient.subscribe({ topics: [STATE_TOPIC] }).subscribe({
    next: handleStateMessage,
    error: (error: unknown) => console.warn('[liveDeviceSource] state subscription error', error),
  })

  pubsubClient.subscribe({ topics: [STATUS_TOPIC] }).subscribe({
    next: handleStatusMessage,
    error: (error: unknown) => console.warn('[liveDeviceSource] status subscription error', error),
  })
}

/** Lazily connects the first time anything subscribes, exactly once for
 *  the page's lifetime - mirrors mockDeviceSource's lazy-start convention,
 *  and makes React StrictMode's double-invoked effects harmless. */
function ensureStarted(): void {
  if (startPromise === null) {
    startPromise = start()
  }
}

export function subscribe(listener: SampleListener): () => void {
  sampleListeners.add(listener)
  ensureStarted()
  if (lastSample !== null) listener(lastSample)
  return () => {
    sampleListeners.delete(listener)
  }
}

export function subscribeConnectionPhase(listener: ConnectionPhaseListener): () => void {
  connectionListeners.add(listener)
  ensureStarted()
  listener(lastConnectionPhase)
  return () => {
    connectionListeners.delete(listener)
  }
}

export function subscribeDeviceReportedStatus(listener: DeviceReportedStatusListener): () => void {
  statusListeners.add(listener)
  ensureStarted()
  listener(lastDeviceReportedStatus)
  return () => {
    statusListeners.delete(listener)
  }
}
