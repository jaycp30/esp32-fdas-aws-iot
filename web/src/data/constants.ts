import type { ChannelId } from '../types/zone'

/**
 * How long we'll wait without a fresh sample before declaring the device
 * OFFLINE.
 *
 * Why 90 seconds: the module is expected to publish a telemetry sample on a
 * steady cadence (this mock uses 10s; the real ESP32 will publish on a
 * similar short interval over MQTT). 90s is roughly 3x that expected
 * interval - long enough to absorb a couple of missed publishes from normal
 * network jitter or a brief Wi-Fi/MQTT reconnect without the UI flapping
 * between ONLINE and OFFLINE, but still short enough that an operator finds
 * out about a real disconnect within about a minute and a half, which
 * matters for a life-safety annunciator. This value lives in one place
 * because the "is the data stale" question must only ever be answered once
 * (see deriveDeviceStatus), not re-implemented per component.
 */
export const HEARTBEAT_TIMEOUT_MS = 90_000

/** How often the mock device "phones home" while it is online. */
export const MOCK_HEARTBEAT_INTERVAL_MS = 10_000

/**
 * The five physical inputs, in the fixed order they are wired on the panel
 * and silkscreened on the module: Z1, Z2, Z3, Z4, then MON. Every list of
 * channels in the app is built from this array so the order can never
 * accidentally drift between the mock feed, the derivation layer and the
 * card list.
 */
export const CHANNEL_ORDER: ReadonlyArray<{
  id: ChannelId
  kind: 'zone' | 'monitor'
  label: string
  badge: string
}> = [
  { id: 'z1', kind: 'zone', label: 'ZONE 01', badge: '1' },
  { id: 'z2', kind: 'zone', label: 'ZONE 02', badge: '2' },
  { id: 'z3', kind: 'zone', label: 'ZONE 03', badge: '3' },
  { id: 'z4', kind: 'zone', label: 'ZONE 04', badge: '4' },
  { id: 'mon', kind: 'monitor', label: 'MONITOR', badge: 'M' },
]
