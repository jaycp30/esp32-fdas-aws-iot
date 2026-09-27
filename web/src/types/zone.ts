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
  /**
   * When this snapshot was actually taken, epoch ms.
   *
   * For live data this is ALWAYS the device's own payload `ts` field
   * (epoch seconds, converted to ms) - never this browser's arrival time.
   * That's contract rule C1 (docs/mqtt-contract.md): AWS IoT delivers a
   * *retained* message to a brand-new subscriber instantly, even if it's
   * hours old, so judging staleness from arrival time would show a dead
   * device as freshly alive. Named `reportedAt` rather than `receivedAt`
   * specifically so that distinction can't get blurred at a call site -
   * see `deriveDeviceStatus` in data/deriveDeviceState.ts, the one place
   * this is ever compared against "now".
   */
  reportedAt: number
  /** All five channels, always in fixed Z1, Z2, Z3, Z4, MON order. */
  channels: ChannelSample[]
}

/**
 * The DEVICE's own connectivity, from its own signals only: how long ago
 * its last `state` snapshot claims to be from, and what it last said on
 * its `status` topic. This says nothing about whether THIS BROWSER can
 * currently hear it - see `ViewerConnectionState` for that orthogonal
 * question, and `ConnectivityState` for how the two combine into what the
 * UI actually renders. This is a DERIVED value, never something the
 * mock/device sends directly - see `deriveDeviceStatus`.
 */
export type DeviceStatus = 'ONLINE' | 'OFFLINE'

/**
 * The two signals a data source (mock or live) reports alongside samples,
 * shared by data/mockDeviceSource.ts and data/liveDeviceSource.ts so
 * hooks/useZoneFeed.ts can treat either one identically.
 *
 * - `ConnectionPhase`: THIS BROWSER's own MQTT/WebSocket link health, from
 *   Amplify PubSub's Hub connection-state events in the live source. The
 *   mock source has no real socket, so it reports a constant 'connected'.
 * - `DeviceReportedStatus`: the device's own retained `status` topic
 *   (`online`/`offline`, contract rule C2) - 'unknown' until an explicit
 *   status message has been seen. The mock source never simulates this
 *   distinct signal (its "offline" scenarios work purely via staleness),
 *   so it always reports 'unknown'.
 */
export type ConnectionPhase = 'connecting' | 'connected' | 'disconnected'
export type DeviceReportedStatus = 'online' | 'offline' | 'unknown'

/**
 * THIS BROWSER's own link to AWS IoT Core - see `ConnectionPhase` above,
 * uppercased to match the other UI-facing state unions in this file.
 */
export type ViewerConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'

/**
 * The one connectivity value the UI actually branches on. Computed by
 * `deriveConnectivityState` (data/deriveDeviceState.ts) from DeviceStatus +
 * ViewerConnectionState + "have we ever received a sample" - see that
 * function for the combining rules and the priority between the two
 * different UNKNOWN-causing failure modes (the device itself being
 * offline/stale, vs. this browser's own connection having dropped).
 */
export type ConnectivityState = 'CONNECTING' | 'VIEWER_DISCONNECTED' | 'DEVICE_OFFLINE' | 'ONLINE'

/**
 * The state actually rendered for a channel, after the staleness rule has
 * been applied. This is a superset of the raw states plus UNKNOWN, which
 * only ever appears when ConnectivityState isn't ONLINE (device offline
 * or stale, OR this browser's own connection is down).
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
  /**
   * Contract rule C3 ("OFFLINE never erases an alarm"): epoch ms of the
   * `reportedAt` of the last sample in which this channel's raw value was
   * the "true"/active reading (alarm for a zone, active for MON) - but
   * ONLY while `state` is currently UNKNOWN. Null whenever the channel
   * isn't UNKNOWN, AND whenever its last known reading was normal - that
   * second case is deliberate, not an oversight: a channel last seen
   * NORMAL gets no marker at all, because "last reported normal" carries
   * no urgency, and a marker on every quiet zone would bury the ones that
   * actually matter. See components/ZoneCard.tsx for how this renders.
   */
  lastReportedActiveAt: number | null
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

/** The demo scenarios the "Demo" switcher can select. */
export type ScenarioId =
  | 'all-normal'
  | 'zone2-alarm'
  | 'multi-alarm'
  | 'monitor-trouble'
  | 'offline'
  | 'offline-after-alarm'
