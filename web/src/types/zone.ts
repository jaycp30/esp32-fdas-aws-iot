/**
 * Domain types for FDAS Monitoring.
 *
 * These types describe the shape of data everywhere in the app - the mock
 * feed, the derivation logic, and the components all import from here.
 * When the mock feed is swapped for a real AWS IoT Core / Amplify Data
 * subscription, these types are the contract the new data source has to
 * satisfy; nothing else should need to change.
 */

/** The four physical zone inputs wired to the panel's zone relay contacts. */
export type ZoneId = 'z1' | 'z2' | 'z3' | 'z4'

/** The fifth input, wired to the panel's monitor/supervisory contact. */
export type MonitorId = 'mon'

/** Every input the Smart Input Module reports, in their fixed panel order. */
export type ChannelId = ZoneId | MonitorId

/**
 * Raw status a Z1-Z4 zone input can report. This mirrors the panel relay
 * states: the contact is either quiet (normal), in alarm, or the module has
 * detected a wiring/supervisory fault on that input (trouble).
 */
export type ZoneRawState = 'normal' | 'alarm' | 'trouble'

/**
 * Raw status the MON input can report. MON is wired to the panel's monitor
 * contact, whose exact meaning on this installation has not been confirmed
 * yet - so instead of reusing "alarm" (which implies fire), an active
 * monitor contact is reported as neutrally-worded "active".
 */
export type MonitorRawState = 'normal' | 'active' | 'trouble'

/** A single input's raw reading, as the device would publish it. */
export type ChannelSample =
  | { kind: 'zone'; id: ZoneId; raw: ZoneRawState }
  | { kind: 'monitor'; id: MonitorId; raw: MonitorRawState }

/** One full telemetry snapshot from the Smart Input Module. */
export interface DeviceSample {
  /** When this sample was received by the app (epoch ms). */
  receivedAt: number
  /** All five channels, always in fixed Z1, Z2, Z3, Z4, MON order. */
  channels: ChannelSample[]
}

/**
 * Whole-device connectivity, derived from how long ago the last sample
 * arrived. This is a DERIVED value, never something the mock/device sends
 * directly - see `deriveDeviceStatus` for the staleness rule itself.
 */
export type DeviceStatus = 'ONLINE' | 'OFFLINE'

/**
 * The state actually rendered for a channel, after the staleness rule has
 * been applied. This is a superset of the raw states plus UNKNOWN, which
 * only ever appears when the device itself is OFFLINE.
 */
export type DisplayState = 'NORMAL' | 'ALARM' | 'TROUBLE' | 'ACTIVE' | 'UNKNOWN'

/** A channel, fully resolved and ready for a card component to render. */
export interface ChannelViewModel {
  id: ChannelId
  kind: 'zone' | 'monitor'
  /** e.g. "ZONE 01" or "MONITOR" */
  label: string
  /** e.g. "1" or "M" - printed in the round badge. */
  badge: string
  state: DisplayState
}

/** An accessibility announcement queued for one of the two live regions. */
export interface Announcement {
  politeness: 'polite' | 'assertive'
  message: string
  /** Monotonically increasing id so React always treats a repeat message
   *  (e.g. the same alarm re-announced) as a fresh DOM mutation, which is
   *  what actually triggers screen readers to speak an aria-live region. */
  key: number
}

/** The five demo scenarios the "Demo" switcher can select. */
export type ScenarioId =
  | 'all-normal'
  | 'zone2-alarm'
  | 'multi-alarm'
  | 'monitor-trouble'
  | 'offline'
