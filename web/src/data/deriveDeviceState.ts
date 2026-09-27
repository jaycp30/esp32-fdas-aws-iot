/**
 * Pure derivation logic: turns a raw DeviceSample + "now" into everything the
 * UI needs to render. This is the ONE place the staleness/offline rule is
 * implemented - components never compare timestamps themselves, they just
 * render whatever DisplayState they're handed.
 *
 * Keeping this pure (no React, no timers, no subscriptions) makes the
 * life-safety rule easy to read in isolation and easy to unit test later.
 */
import { CHANNEL_ORDER, HEARTBEAT_TIMEOUT_MS } from './constants'
import type {
  ChannelViewModel,
  ConnectivityState,
  DeviceSample,
  DeviceStatus,
  ViewerConnectionState,
} from '../types/zone'

/**
 * The core "never show a false all-clear" rule for the DEVICE's own state:
 * a device with no sample yet, or whose last sample is older than
 * HEARTBEAT_TIMEOUT_MS, is OFFLINE (contract rule C1). A device that has
 * explicitly told us it's offline is ALSO offline, immediately, regardless
 * of how fresh its last snapshot's `ts` looks (contract rule C2) - a
 * device can drop off the network seconds after a perfectly healthy
 * snapshot, and the retained `status` topic is what tells us that faster
 * than waiting out the 90s staleness backstop.
 */
export function deriveDeviceStatus(
  sample: DeviceSample | null,
  now: number,
  reportedOffline: boolean,
): DeviceStatus {
  if (reportedOffline) return 'OFFLINE'
  if (sample === null) return 'OFFLINE'
  return now - sample.reportedAt > HEARTBEAT_TIMEOUT_MS ? 'OFFLINE' : 'ONLINE'
}

/**
 * Combines the device's own status (deriveDeviceStatus) with this
 * browser's separate link to AWS IoT into the single value the rest of
 * the UI renders from. Priority, most urgent/certain first:
 *
 * 1. CONNECTING - no sample has EVER arrived. We don't know anything yet,
 *    so this can't be "device offline" either (that's a claim about a
 *    real device we haven't heard a word from) - it's its own neutral
 *    state, and it must never resolve to a channel showing NORMAL.
 * 2. VIEWER_DISCONNECTED - OUR OWN socket to AWS IoT is down. Whatever the
 *    last sample said, we cannot currently trust that it's still true (new
 *    telemetry could be arriving and we'd never know) - this has to win
 *    over a stale-but-not-yet-90s DEVICE_OFFLINE read, and it must not
 *    wait for the 90s staleness clock the way device staleness does.
 * 3. DEVICE_OFFLINE - our socket is fine, but the device itself is
 *    offline or stale.
 * 4. ONLINE - everything checks out; channels show their real state.
 */
export function deriveConnectivityState(
  hasSample: boolean,
  viewerConnection: ViewerConnectionState,
  deviceStatus: DeviceStatus,
): ConnectivityState {
  if (!hasSample) return 'CONNECTING'
  if (viewerConnection !== 'CONNECTED') return 'VIEWER_DISCONNECTED'
  if (deviceStatus === 'OFFLINE') return 'DEVICE_OFFLINE'
  return 'ONLINE'
}

const RAW_TO_DISPLAY = {
  normal: 'NORMAL',
  alarm: 'ALARM',
  trouble: 'TROUBLE',
  active: 'ACTIVE',
} as const

/**
 * Builds the five card view models in fixed panel order. Whenever
 * connectivityState isn't ONLINE (device offline/stale, OR this browser's
 * own connection dropped, OR we're still waiting for a first sample) every
 * channel is forced to UNKNOWN regardless of its last reported value -
 * this is the "never show a false all-clear" rule applied per-card. The
 * card list is never sorted or filtered by severity here or anywhere else;
 * CHANNEL_ORDER's order is the only order that ever exists, matching the
 * physical positions printed on the panel.
 */
export function deriveChannelViewModels(
  sample: DeviceSample | null,
  connectivityState: ConnectivityState,
): ChannelViewModel[] {
  const isUnknown = connectivityState !== 'ONLINE'

  return CHANNEL_ORDER.map((meta) => {
    const reading = sample?.channels.find((c) => c.id === meta.id)
    const state = isUnknown || !reading ? 'UNKNOWN' : RAW_TO_DISPLAY[reading.raw]

    // C3 ("OFFLINE never erases an alarm"): a channel whose LAST reading
    // was the "true"/active raw value keeps a visible marker while
    // UNKNOWN - see the ChannelViewModel.lastReportedActiveAt field
    // comment in types/zone.ts for why a last-normal reading gets no
    // marker at all. `reading` (not the forced-UNKNOWN `state`) is what we
    // check here on purpose, since it's the last thing the device actually
    // told us, independent of why we're UNKNOWN right now.
    const wasReportedActive = reading?.raw === 'alarm' || reading?.raw === 'active'
    const lastReportedActiveAt = isUnknown && wasReportedActive && sample ? sample.reportedAt : null

    return {
      id: meta.id,
      kind: meta.kind,
      label: meta.label,
      badge: meta.badge,
      state,
      lastReportedActiveAt,
    }
  })
}

/** Zones (not MON) currently in ALARM, in fixed panel order. */
export function alarmingZoneLabels(channels: ChannelViewModel[]): string[] {
  return channels.filter((c) => c.kind === 'zone' && c.state === 'ALARM').map((c) => c.label)
}

/**
 * Zones (not MON) that are currently UNKNOWN but carry a C3 "last reported
 * ALARM" marker, in fixed panel order. Powers the connectivity banner's
 * "Last reported alarms: ..." line (see ConnectivityBanner.tsx) - kept
 * deliberately separate from the top red AlarmBanner, which never shows
 * during any UNKNOWN state (see App.tsx's comment on why those two can
 * never both be visible at once).
 */
export function lastReportedAlarmZoneLabels(channels: ChannelViewModel[]): string[] {
  return channels
    .filter((c) => c.kind === 'zone' && c.state === 'UNKNOWN' && c.lastReportedActiveAt !== null)
    .map((c) => c.label)
}

/** "ZONE 02" -> "Zone 02". Shared so the on-screen banner and the assistive-
 *  tech announcement (useZoneFeed) read the alarming zones the same way. */
export function toTitleCase(label: string): string {
  return label
    .toLowerCase()
    .split(' ')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

/** The red top-of-page summary text, e.g. "FIRE ALARM - Zone 02, Zone 03". */
export function buildAlarmSummary(alarmLabels: string[]): string | null {
  if (alarmLabels.length === 0) return null
  return `FIRE ALARM — ${alarmLabels.map(toTitleCase).join(', ')}`
}

/** The connectivity banner's C3 summary line, e.g.
 *  "Last reported alarms: Zone 02". Deliberately quieter wording than
 *  buildAlarmSummary's "FIRE ALARM" - this is history, not a live alarm. */
export function buildLastReportedAlarmSummary(labels: string[]): string | null {
  if (labels.length === 0) return null
  return `Last reported alarms: ${labels.map(toTitleCase).join(', ')}`
}
