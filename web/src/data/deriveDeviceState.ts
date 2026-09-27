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
import type { ChannelViewModel, DeviceSample, DeviceStatus } from '../types/zone'

/**
 * The core "never show a false all-clear" rule: a device with no sample yet,
 * or whose last sample is older than HEARTBEAT_TIMEOUT_MS, is OFFLINE.
 */
export function deriveDeviceStatus(sample: DeviceSample | null, now: number): DeviceStatus {
  if (sample === null) return 'OFFLINE'
  return now - sample.receivedAt > HEARTBEAT_TIMEOUT_MS ? 'OFFLINE' : 'ONLINE'
}

const RAW_TO_DISPLAY = {
  normal: 'NORMAL',
  alarm: 'ALARM',
  trouble: 'TROUBLE',
  active: 'ACTIVE',
} as const

/**
 * Builds the five card view models in fixed panel order. When the device is
 * OFFLINE every channel is forced to UNKNOWN regardless of its last reported
 * value - this is the "never show a false all-clear" rule applied per-card.
 * The card list is never sorted or filtered by severity here or anywhere
 * else; CHANNEL_ORDER's order is the only order that ever exists, matching
 * the physical positions printed on the panel.
 */
export function deriveChannelViewModels(
  sample: DeviceSample | null,
  deviceStatus: DeviceStatus,
): ChannelViewModel[] {
  return CHANNEL_ORDER.map((meta) => {
    const reading = sample?.channels.find((c) => c.id === meta.id)
    const state = deviceStatus === 'OFFLINE' || !reading ? 'UNKNOWN' : RAW_TO_DISPLAY[reading.raw]

    return {
      id: meta.id,
      kind: meta.kind,
      label: meta.label,
      badge: meta.badge,
      state,
    }
  })
}

/** Zones (not MON) currently in ALARM, in fixed panel order. */
export function alarmingZoneLabels(channels: ChannelViewModel[]): string[] {
  return channels.filter((c) => c.kind === 'zone' && c.state === 'ALARM').map((c) => c.label)
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
