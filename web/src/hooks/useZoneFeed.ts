/**
 * The single hook every component uses to read device/zone state.
 *
 * This is the seam described in the project brief: everything above this
 * hook (components) only ever sees ChannelViewModel + DeviceStatus. Every
 * "how do we know?" question - is the device online, what does each zone
 * currently read, has a new alarm just started - is answered inside this
 * file and data/deriveDeviceState.ts. Swapping the mock feed for a real
 * Amplify Data / AWS IoT Core subscription later means changing the single
 * `subscribe` import below; no component changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentScenario, setScenario as publishScenario, subscribe } from '../data/mockDeviceSource'
import {
  alarmingZoneLabels,
  buildAlarmSummary,
  deriveChannelViewModels,
  deriveDeviceStatus,
  toTitleCase,
} from '../data/deriveDeviceState'
import type {
  Announcement,
  ChannelId,
  ChannelViewModel,
  DeviceSample,
  DeviceStatus,
  DisplayState,
  ScenarioId,
} from '../types/zone'

/** How often we re-check staleness and refresh relative-time text, even if
 *  no new sample has arrived - going quiet IS the offline signal. */
const CLOCK_TICK_MS = 1_000

export interface ZoneFeedState {
  deviceStatus: DeviceStatus
  /** Epoch ms of the last sample we actually received, or null before the
   *  first one arrives. Powers both "Last update" and "Last contact". */
  lastContactAt: number | null
  /** Ticking clock, for components to compute relative time against. */
  now: number
  /** All five channels, always in fixed Z1-Z4-MON order. */
  channels: ChannelViewModel[]
  hasActiveAlarm: boolean
  /** e.g. "FIRE ALARM - Zone 02", or null when nothing is alarming. */
  alarmSummary: string | null
  scenario: ScenarioId
  setScenario: (id: ScenarioId) => void
  /** Ordinary status changes (connectivity, trouble, recovery). null before
   *  anything has changed. See components/LiveRegions.tsx. */
  politeAnnouncement: Announcement | null
  /** A brand-new fire alarm only - the one thing urgent enough to interrupt. */
  assertiveAnnouncement: Announcement | null
}

/** Short phrase for a channel's state, used only in the polite announcement
 *  ("Zone 03 trouble.") - the card's own text label (see ZoneCard) is what
 *  sighted users read; this is its spoken equivalent. */
function describeState(state: DisplayState): string {
  switch (state) {
    case 'NORMAL':
      return 'normal'
    case 'TROUBLE':
      return 'trouble'
    case 'ACTIVE':
      return 'active'
    case 'ALARM':
      return 'alarm'
    case 'UNKNOWN':
      return 'unknown'
  }
}

function toStateMap(channels: ChannelViewModel[]): Partial<Record<ChannelId, DisplayState>> {
  const map: Partial<Record<ChannelId, DisplayState>> = {}
  for (const channel of channels) map[channel.id] = channel.state
  return map
}

export function useZoneFeed(): ZoneFeedState {
  const [sample, setSample] = useState<DeviceSample | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [scenario, setScenarioState] = useState<ScenarioId>(getCurrentScenario())
  const [politeAnnouncement, setPoliteAnnouncement] = useState<Announcement | null>(null)
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState<Announcement | null>(null)

  // Previous-render snapshots, kept only to detect *transitions* for the
  // live-region announcements below.
  const hasBaselineRef = useRef(false)
  const prevStatusRef = useRef<DeviceStatus>('OFFLINE')
  const prevChannelStatesRef = useRef<Partial<Record<ChannelId, DisplayState>>>({})
  const announcementKeyRef = useRef(0)

  useEffect(() => subscribe(setSample), [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const deviceStatus = deriveDeviceStatus(sample, now)
  const channels = deriveChannelViewModels(sample, deviceStatus)
  const alarmLabels = alarmingZoneLabels(channels)
  // A stable string proxy for channels' contents: `channels` itself is a
  // fresh array every render (including every no-op clock tick), so using
  // it directly as an effect dependency below would re-run the transition
  // check every second. This value only changes when a channel's state
  // actually changes.
  const stateKey = channels.map((c) => c.state).join('|')

  useEffect(() => {
    // No sample has arrived yet: the OFFLINE you'd derive from that is "we
    // haven't heard from the device", not a real transition, so there is
    // nothing to compare against or announce yet.
    if (sample === null) return

    const currentStates = toStateMap(channels)

    if (!hasBaselineRef.current) {
      // First real sample: silently establish the baseline. Loading the
      // page for the first time is not a "device came back online" event,
      // so this deliberately does NOT announce anything.
      hasBaselineRef.current = true
      prevStatusRef.current = deviceStatus
      prevChannelStatesRef.current = currentStates
      return
    }

    const prevStatus = prevStatusRef.current
    const prevStates = prevChannelStatesRef.current

    // A channel just entered ALARM that wasn't already in it - the one
    // event urgent enough for an assertive (interrupting) announcement.
    const newlyAlarming = channels.filter((c) => c.state === 'ALARM' && prevStates[c.id] !== 'ALARM')
    if (newlyAlarming.length > 0) {
      announcementKeyRef.current += 1
      setAssertiveAnnouncement({
        politeness: 'assertive',
        message: `Fire alarm, ${newlyAlarming.map((c) => toTitleCase(c.label)).join(', ')}.`,
        key: announcementKeyRef.current,
      })
    }

    if (deviceStatus !== prevStatus) {
      // Connectivity changed. This alone explains every channel simultaneously
      // flipping to/from UNKNOWN, so it takes the place of (rather than adds
      // to) per-channel messages below for this tick.
      announcementKeyRef.current += 1
      setPoliteAnnouncement({
        politeness: 'polite',
        message:
          deviceStatus === 'OFFLINE'
            ? 'Input module offline. Zone states unknown.'
            : 'Input module back online.',
        key: announcementKeyRef.current,
      })
    } else if (deviceStatus === 'ONLINE') {
      // Ordinary per-channel changes while connectivity itself is stable:
      // trouble starting/clearing, an alarm clearing, MON going active.
      // (A brand-new alarm is excluded here - it was already announced
      // assertively above, and doesn't need a second, quieter echo.)
      const otherChanges = channels.filter((c) => {
        const prev = prevStates[c.id]
        const isNewAlarm = c.state === 'ALARM' && prev !== 'ALARM'
        return prev !== undefined && prev !== c.state && !isNewAlarm
      })

      if (otherChanges.length > 0) {
        announcementKeyRef.current += 1
        setPoliteAnnouncement({
          politeness: 'polite',
          message: otherChanges.map((c) => `${toTitleCase(c.label)} ${describeState(c.state)}.`).join(' '),
          key: announcementKeyRef.current,
        })
      }
    }

    prevStatusRef.current = deviceStatus
    prevChannelStatesRef.current = currentStates
    // `channels` is deliberately left out here even though the body reads
    // it: it's a pure function of `sample`/`deviceStatus` (both already
    // listed), and `stateKey` is a content-based proxy for it - including
    // the array itself would just make this effect re-run every second as
    // the clock ticks, for no behavioural difference. See `stateKey`'s
    // comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, deviceStatus, stateKey])

  const setScenario = useCallback((id: ScenarioId) => {
    publishScenario(id)
    setScenarioState(id)
  }, [])

  return {
    deviceStatus,
    lastContactAt: sample?.receivedAt ?? null,
    now,
    channels,
    hasActiveAlarm: alarmLabels.length > 0,
    alarmSummary: buildAlarmSummary(alarmLabels),
    scenario,
    setScenario,
    politeAnnouncement,
    assertiveAnnouncement,
  }
}
