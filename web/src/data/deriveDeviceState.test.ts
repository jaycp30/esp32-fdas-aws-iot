import { describe, expect, it } from 'vitest'
import { HEARTBEAT_TIMEOUT_MS } from './constants'
import { deriveChannelViewModels, deriveConnectivityState, deriveDeviceStatus } from './deriveDeviceState'
import type { ChannelSample, DeviceSample } from '../types/zone'

const ALL_NORMAL: ChannelSample[] = [
  { kind: 'zone', id: 'z1', raw: 'normal' },
  { kind: 'zone', id: 'z2', raw: 'normal' },
  { kind: 'zone', id: 'z3', raw: 'normal' },
  { kind: 'zone', id: 'z4', raw: 'normal' },
  { kind: 'monitor', id: 'mon', raw: 'normal' },
]

function sampleAt(reportedAt: number, channels: ChannelSample[] = ALL_NORMAL): DeviceSample {
  return { reportedAt, channels }
}

describe('deriveDeviceStatus', () => {
  const T0 = 1_000_000

  it('C1: is ONLINE when the payload ts is fresh, regardless of when it happened to arrive', () => {
    const sample = sampleAt(T0)
    expect(deriveDeviceStatus(sample, T0 + 1_000, false)).toBe('ONLINE')
  })

  it('C1: is OFFLINE once the payload ts is older than HEARTBEAT_TIMEOUT_MS - even for a message that just arrived', () => {
    // The message could have been sitting retained on the broker for ages
    // and only just been delivered - staleness must be judged from `ts`
    // (reportedAt), never from "we only just received this".
    const staleSample = sampleAt(T0)
    const now = T0 + HEARTBEAT_TIMEOUT_MS + 1
    expect(deriveDeviceStatus(staleSample, now, false)).toBe('OFFLINE')
  })

  it('is OFFLINE with no sample at all', () => {
    expect(deriveDeviceStatus(null, T0, false)).toBe('OFFLINE')
  })

  it('C2: reportedOffline forces OFFLINE immediately, even with a perfectly fresh ts', () => {
    const sample = sampleAt(T0)
    expect(deriveDeviceStatus(sample, T0, true)).toBe('OFFLINE')
  })
})

describe('deriveConnectivityState', () => {
  it('is CONNECTING whenever no sample has ever arrived, regardless of the other two inputs', () => {
    expect(deriveConnectivityState(false, 'CONNECTED', 'ONLINE')).toBe('CONNECTING')
    expect(deriveConnectivityState(false, 'DISCONNECTED', 'OFFLINE')).toBe('CONNECTING')
  })

  it('is VIEWER_DISCONNECTED when our own link is down, even if the device last looked fine', () => {
    expect(deriveConnectivityState(true, 'DISCONNECTED', 'ONLINE')).toBe('VIEWER_DISCONNECTED')
    expect(deriveConnectivityState(true, 'CONNECTING', 'ONLINE')).toBe('VIEWER_DISCONNECTED')
  })

  it('is DEVICE_OFFLINE when our link is fine but the device is not', () => {
    expect(deriveConnectivityState(true, 'CONNECTED', 'OFFLINE')).toBe('DEVICE_OFFLINE')
  })

  it('is ONLINE only when a sample exists, our link is connected, and the device is online', () => {
    expect(deriveConnectivityState(true, 'CONNECTED', 'ONLINE')).toBe('ONLINE')
  })
})

describe('deriveChannelViewModels', () => {
  it('CONNECTING never yields NORMAL, even if the last sample was all-clear', () => {
    const channels = deriveChannelViewModels(sampleAt(0), 'CONNECTING')
    expect(channels.every((c) => c.state === 'UNKNOWN')).toBe(true)
  })

  it('VIEWER_DISCONNECTED never yields NORMAL, even if the last sample was all-clear', () => {
    const channels = deriveChannelViewModels(sampleAt(0), 'VIEWER_DISCONNECTED')
    expect(channels.every((c) => c.state === 'UNKNOWN')).toBe(true)
  })

  it('ONLINE renders the real reading (control case)', () => {
    const channels = deriveChannelViewModels(sampleAt(0), 'ONLINE')
    expect(channels.every((c) => c.state === 'NORMAL')).toBe(true)
  })

  it('C3: an UNKNOWN channel whose last reading was ALARM/ACTIVE carries lastReportedActiveAt', () => {
    const reportedAt = 42_000
    const channels: ChannelSample[] = [
      { kind: 'zone', id: 'z1', raw: 'alarm' },
      { kind: 'zone', id: 'z2', raw: 'normal' },
      { kind: 'zone', id: 'z3', raw: 'trouble' },
      { kind: 'zone', id: 'z4', raw: 'normal' },
      { kind: 'monitor', id: 'mon', raw: 'active' },
    ]
    const result = deriveChannelViewModels(sampleAt(reportedAt, channels), 'DEVICE_OFFLINE')

    const byId = Object.fromEntries(result.map((c) => [c.id, c]))
    expect(byId.z1.state).toBe('UNKNOWN')
    expect(byId.z1.lastReportedActiveAt).toBe(reportedAt) // was alarm -> marker

    expect(byId.mon.lastReportedActiveAt).toBe(reportedAt) // was active -> marker
  })

  it('C3: a channel last reported NORMAL (or TROUBLE) gets no marker at all - deliberate asymmetry', () => {
    const reportedAt = 42_000
    const channels: ChannelSample[] = [
      { kind: 'zone', id: 'z1', raw: 'alarm' },
      { kind: 'zone', id: 'z2', raw: 'normal' },
      { kind: 'zone', id: 'z3', raw: 'trouble' },
      { kind: 'zone', id: 'z4', raw: 'normal' },
      { kind: 'monitor', id: 'mon', raw: 'normal' },
    ]
    const result = deriveChannelViewModels(sampleAt(reportedAt, channels), 'DEVICE_OFFLINE')
    const byId = Object.fromEntries(result.map((c) => [c.id, c]))

    expect(byId.z2.lastReportedActiveAt).toBeNull()
    expect(byId.z3.lastReportedActiveAt).toBeNull() // 'trouble' isn't a boolean-true reading either
    expect(byId.mon.lastReportedActiveAt).toBeNull()
  })

  it('C3: no marker while ONLINE, even for a channel currently in ALARM - the marker is an UNKNOWN-only affordance', () => {
    const channels: ChannelSample[] = [
      { kind: 'zone', id: 'z1', raw: 'alarm' },
      { kind: 'zone', id: 'z2', raw: 'normal' },
      { kind: 'zone', id: 'z3', raw: 'normal' },
      { kind: 'zone', id: 'z4', raw: 'normal' },
      { kind: 'monitor', id: 'mon', raw: 'normal' },
    ]
    const result = deriveChannelViewModels(sampleAt(0, channels), 'ONLINE')
    const z1 = result.find((c) => c.id === 'z1')!
    expect(z1.state).toBe('ALARM')
    expect(z1.lastReportedActiveAt).toBeNull()
  })
})
