/**
 * Tests for the pure, exported helpers in liveDeviceSource.ts (parsing and
 * C4 dedupe/reboot detection). The module also does side-effecting work at
 * import time is avoided deliberately - connecting to AWS IoT only happens
 * lazily inside subscribe()/ensureStarted() - so importing this file for
 * its pure exports here never tries to reach the network. It does need
 * `amplify_outputs.json` to exist to resolve the import, matching the
 * project's build-time requirement (see README.md's "Local backend
 * development" section) - `npm test` is expected to run alongside `npm run
 * build`, not standalone with no backend ever configured.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn() }))
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn() } }))
vi.mock('@aws-amplify/pubsub', () => ({
  PubSub: class {},
  CONNECTION_STATE_CHANGE: 'ConnectionStateChange',
  ConnectionState: {
    Connected: 'Connected',
    ConnectedPendingDisconnect: 'ConnectedPendingDisconnect',
    ConnectedPendingKeepAlive: 'ConnectedPendingKeepAlive',
    ConnectedPendingNetwork: 'ConnectedPendingNetwork',
    Connecting: 'Connecting',
    ConnectionDisrupted: 'ConnectionDisrupted',
    ConnectionDisruptedPendingNetwork: 'ConnectionDisruptedPendingNetwork',
    Disconnected: 'Disconnected',
  },
}))

const { isNewerSnapshot, parseStatePayload, parseStatusPayload, toConnectionPhase } = await import('./liveDeviceSource')
const { ConnectionState } = await import('@aws-amplify/pubsub')

const VALID_PAYLOAD = {
  v: 1,
  device: 'fdas-iot-ane1-input-01',
  ts: 1_790_495_112,
  seq: 42,
  uptime_s: 3_601,
  rssi: -28,
  inputs: { z1: false, z2: true, z3: false, z4: false, mon: false },
}

describe('parseStatePayload', () => {
  it('accepts a valid v1 payload', () => {
    const parsed = parseStatePayload(VALID_PAYLOAD)
    expect(parsed).not.toBeNull()
    expect(parsed?.ts).toBe(VALID_PAYLOAD.ts)
    expect(parsed?.inputs.z2).toBe(true)
  })

  it('C5: ignores unknown extra fields rather than rejecting them', () => {
    const withExtra = {
      ...VALID_PAYLOAD,
      firmware_build: 'abc123',
      inputs: { ...VALID_PAYLOAD.inputs, spare: true },
    }
    const parsed = parseStatePayload(withExtra)
    expect(parsed).not.toBeNull()
    expect(parsed).not.toHaveProperty('firmware_build')
  })

  it('C5: rejects an unknown major version', () => {
    expect(parseStatePayload({ ...VALID_PAYLOAD, v: 2 })).toBeNull()
  })

  it('rejects a version given as a string instead of a number', () => {
    expect(parseStatePayload({ ...VALID_PAYLOAD, v: '1' })).toBeNull()
  })

  it('rejects a missing v field', () => {
    const { v: _v, ...withoutVersion } = VALID_PAYLOAD
    expect(parseStatePayload(withoutVersion)).toBeNull()
  })

  it('rejects a payload missing a required numeric field', () => {
    const { seq: _seq, ...withoutSeq } = VALID_PAYLOAD
    expect(parseStatePayload(withoutSeq)).toBeNull()
  })

  it('rejects a payload whose inputs are missing a channel', () => {
    const { mon: _mon, ...partialInputs } = VALID_PAYLOAD.inputs
    expect(parseStatePayload({ ...VALID_PAYLOAD, inputs: partialInputs })).toBeNull()
  })

  it('rejects a payload whose input is the wrong type (a string instead of a boolean)', () => {
    expect(
      parseStatePayload({
        ...VALID_PAYLOAD,
        inputs: { ...VALID_PAYLOAD.inputs, z1: 'false' },
      }),
    ).toBeNull()
  })

  it('never throws on garbage input', () => {
    expect(() => parseStatePayload('online')).not.toThrow()
    expect(() => parseStatePayload(null)).not.toThrow()
    expect(() => parseStatePayload(undefined)).not.toThrow()
    expect(() => parseStatePayload(42)).not.toThrow()
    expect(() => parseStatePayload([1, 2, 3])).not.toThrow()
    expect(parseStatePayload('online')).toBeNull()
  })
})

describe('isNewerSnapshot (C4)', () => {
  const T = 1_790_498_434 // an epoch-seconds `ts`

  it('accepts the first snapshot when nothing has been accepted yet', () => {
    expect(isNewerSnapshot({ ts: T, uptimeS: 100, seq: 1 }, null)).toBe(true)
  })

  it('accepts a later ts (the normal case: next heartbeat or change)', () => {
    expect(isNewerSnapshot({ ts: T + 30, uptimeS: 130, seq: 5 }, { ts: T, uptimeS: 100, seq: 4 })).toBe(true)
  })

  it('drops an exact duplicate (QoS 1 redelivery)', () => {
    expect(isNewerSnapshot({ ts: T, uptimeS: 100, seq: 4 }, { ts: T, uptimeS: 100, seq: 4 })).toBe(false)
  })

  it('same second: a higher seq is newer, a lower seq is a late copy', () => {
    expect(isNewerSnapshot({ ts: T, uptimeS: 100, seq: 5 }, { ts: T, uptimeS: 100, seq: 4 })).toBe(true)
    expect(isNewerSnapshot({ ts: T, uptimeS: 100, seq: 3 }, { ts: T, uptimeS: 100, seq: 4 })).toBe(false)
  })

  it('REGRESSION: drops a late copy from earlier in the same boot, even though its uptime_s is lower', () => {
    // An older "all normal" snapshot arriving after a newer ALARM snapshot must not
    // overwrite it. Its lower uptime_s looks like a reboot - only ts tells them apart.
    expect(isNewerSnapshot({ ts: T - 20, uptimeS: 80, seq: 3 }, { ts: T, uptimeS: 100, seq: 4 })).toBe(false)
  })

  it('accepts a genuine reboot: uptime_s and seq restart, but ts moves forward', () => {
    expect(isNewerSnapshot({ ts: T + 60, uptimeS: 5, seq: 1 }, { ts: T, uptimeS: 50_000, seq: 12_000 })).toBe(true)
  })
})

describe('parseStatusPayload (C2 / C5)', () => {
  it('accepts the two v1 status payloads', () => {
    expect(parseStatusPayload({ v: 1, status: 'online' })).toBe('online')
    expect(parseStatusPayload({ v: 1, status: 'offline' })).toBe('offline')
  })

  it('ignores unknown extra fields (C5)', () => {
    expect(parseStatusPayload({ v: 1, status: 'offline', reason: 'lwt' })).toBe('offline')
  })

  it('rejects an unknown version, an unknown status word, and the old plain-text form', () => {
    expect(parseStatusPayload({ v: 2, status: 'online' })).toBeNull()
    expect(parseStatusPayload({ v: 1, status: 'maybe' })).toBeNull()
    expect(parseStatusPayload('online')).toBeNull()
  })

  it('never throws on garbage input', () => {
    for (const garbage of [null, undefined, 42, [], {}, { status: null }]) {
      expect(() => parseStatusPayload(garbage)).not.toThrow()
      expect(parseStatusPayload(garbage)).toBeNull()
    }
  })
})

describe('toConnectionPhase', () => {
  it('treats every "Connected*" state as connected', () => {
    expect(toConnectionPhase(ConnectionState.Connected)).toBe('connected')
    expect(toConnectionPhase(ConnectionState.ConnectedPendingDisconnect)).toBe('connected')
    expect(toConnectionPhase(ConnectionState.ConnectedPendingKeepAlive)).toBe('connected')
    expect(toConnectionPhase(ConnectionState.ConnectedPendingNetwork)).toBe('connected')
  })

  it('maps Connecting to connecting', () => {
    expect(toConnectionPhase(ConnectionState.Connecting)).toBe('connecting')
  })

  it('maps every disrupted/disconnected state to disconnected', () => {
    expect(toConnectionPhase(ConnectionState.ConnectionDisrupted)).toBe('disconnected')
    expect(toConnectionPhase(ConnectionState.ConnectionDisruptedPendingNetwork)).toBe('disconnected')
    expect(toConnectionPhase(ConnectionState.Disconnected)).toBe('disconnected')
  })
})
