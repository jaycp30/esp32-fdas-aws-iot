/**
 * The single hook every component uses to read device/zone state.
 *
 * This is the seam described in the project brief: everything above this
 * hook (components) only ever sees ChannelViewModel + ConnectivityState.
 * Every "how do we know?" question - is the device online, is OUR OWN
 * connection to AWS IoT healthy, what does each zone currently read, has a
 * new alarm just started - is answered inside this file and
 * data/deriveDeviceState.ts.
 *
 * Live is the default data source. Appending `?demo=1` to the URL switches
 * to the simulated feed (data/mockDeviceSource.ts) instead, so the Demo
 * scenario switcher keeps working without real hardware - see isDemoMode
 * below. No component needs to know which source is active; they only ever
 * see this hook's return value.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as liveSource from '../data/liveDeviceSource'
import * as mockSource from '../data/mockDeviceSource'
import {
  alarmingZoneLabels,
  buildAlarmSummary,
  buildLastReportedAlarmSummary,
  deriveChannelViewModels,
  deriveConnectivityState,
  deriveDeviceStatus,
  lastReportedAlarmZoneLabels,
  toTitleCase,
} from '../data/deriveDeviceState'
import type {
  Announcement,
  ChannelId,
  ChannelViewModel,
  ConnectionPhase,
  ConnectivityState,
  DeviceReportedStatus,
  DeviceSample,
  DisplayState,
  ScenarioId,
  ViewerConnectionState,
} from '../types/zone'

/** How often we re-check staleness and refresh relative-time text, even if
 *  no new sample has arrived - going quiet IS the offline signal. */
const CLOCK_TICK_MS = 1_000

export interface ZoneFeedState {
  connectivityState: ConnectivityState
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
  /** C3's "Last reported alarms: Zone 02" line for the connectivity
   *  banner, or null when there's nothing to report. */
  lastReportedAlarmSummary: string | null
  /** True when the page was opened with `?demo=1` - see the module-level
   *  comment above. Drives the "DEMO" header label and whether the Demo
   *  menu is reachable at all (App.tsx). */
  isDemoMode: boolean
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

/** Spoken equivalent of a ConnectivityState transition for the polite live
 *  region - see the transition-detection effect below. */
function describeConnectivityChange(state: ConnectivityState): string {
  switch (state) {
    case 'ONLINE':
      return 'Input module back online.'
    case 'DEVICE_OFFLINE':
      return 'Input module offline. Zone states unknown.'
    case 'VIEWER_DISCONNECTED':
      return 'Connection to monitoring service lost. Zone states unknown.'
    case 'CONNECTING':
      return 'Connecting to monitoring service.'
  }
}

function toStateMap(channels: ChannelViewModel[]): Partial<Record<ChannelId, DisplayState>> {
  const map: Partial<Record<ChannelId, DisplayState>> = {}
  for (const channel of channels) map[channel.id] = channel.state
  return map
}

function toViewerConnectionState(phase: ConnectionPhase): ViewerConnectionState {
  switch (phase) {
    case 'connected':
      return 'CONNECTED'
    case 'connecting':
      return 'CONNECTING'
    case 'disconnected':
      return 'DISCONNECTED'
  }
}

export function useZoneFeed(): ZoneFeedState {
  // `?demo=1` is read once, on mount: this is a single-page app with no
  // router, and switching data sources mid-session isn't a feature anyone
  // asked for - the query string is just how you pick a source before the
  // page loads.
  const [isDemoMode] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1',
  )
  const source = isDemoMode ? mockSource : liveSource

  const [sample, setSample] = useState<DeviceSample | null>(null)
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('connecting')
  const [deviceReportedStatus, setDeviceReportedStatus] = useState<DeviceReportedStatus>('unknown')
  const [now, setNow] = useState(() => Date.now())
  const [scenario, setScenarioState] = useState<ScenarioId>(mockSource.getCurrentScenario())
  const [politeAnnouncement, setPoliteAnnouncement] = useState<Announcement | null>(null)
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState<Announcement | null>(null)

  // Previous-render snapshots, kept only to detect *transitions* for the
  // live-region announcements below.
  const hasBaselineRef = useRef(false)
  const prevConnectivityRef = useRef<ConnectivityState>('CONNECTING')
  const prevChannelStatesRef = useRef<Partial<Record<ChannelId, DisplayState>>>({})
  const announcementKeyRef = useRef(0)

  useEffect(() => source.subscribe(setSample), [source])
  useEffect(() => source.subscribeConnectionPhase(setConnectionPhase), [source])
  useEffect(() => source.subscribeDeviceReportedStatus(setDeviceReportedStatus), [source])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const viewerConnection = toViewerConnectionState(connectionPhase)
  const deviceStatus = deriveDeviceStatus(sample, now, deviceReportedStatus === 'offline')
  const connectivityState = deriveConnectivityState(sample !== null, viewerConnection, deviceStatus)
  const channels = deriveChannelViewModels(sample, connectivityState)
  const alarmLabels = alarmingZoneLabels(channels)
  const lastReportedAlarmLabels = lastReportedAlarmZoneLabels(channels)
  // A stable string proxy for channels' contents: `channels` itself is a
  // fresh array every render (including every no-op clock tick), so using
  // it directly as an effect dependency below would re-run the transition
  // check every second. This value only changes when a channel's state
  // actually changes.
  const stateKey = channels.map((c) => c.state).join('|')

  useEffect(() => {
    // No sample has arrived yet: the CONNECTING you'd derive from that is
    // "we haven't heard from the device", not a real transition, so there
    // is nothing to compare against or announce yet.
    if (sample === null) return

    const currentStates = toStateMap(channels)

    if (!hasBaselineRef.current) {
      // First real sample: silently establish the baseline. Loading the
      // page for the first time is not a "device came back online" event,
      // so this deliberately does NOT announce anything.
      hasBaselineRef.current = true
      prevConnectivityRef.current = connectivityState
      prevChannelStatesRef.current = currentStates
      return
    }

    const prevConnectivity = prevConnectivityRef.current
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

    if (connectivityState !== prevConnectivity) {
      // Connectivity changed (device offline/back online, our own link to
      // AWS IoT dropped/recovered, ...). This alone explains every channel
      // simultaneously flipping to/from UNKNOWN, so it takes the place of
      // (rather than adds to) per-channel messages below for this tick.
      announcementKeyRef.current += 1
      setPoliteAnnouncement({
        politeness: 'polite',
        message: describeConnectivityChange(connectivityState),
        key: announcementKeyRef.current,
      })
    } else if (connectivityState === 'ONLINE') {
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

    prevConnectivityRef.current = connectivityState
    prevChannelStatesRef.current = currentStates
    // `channels` is deliberately left out here even though the body reads
    // it: it's a pure function of `sample`/`connectivityState` (both
    // already listed), and `stateKey` is a content-based proxy for it -
    // including the array itself would just make this effect re-run every
    // second as the clock ticks, for no behavioural difference. See
    // `stateKey`'s comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, connectivityState, stateKey])

  const setScenario = useCallback(
    (id: ScenarioId) => {
      // Only meaningful in demo mode - the Demo menu that calls this is
      // never rendered outside it (see App.tsx), so this guard is a
      // belt-and-braces safety net, not a path anything exercises today.
      if (!isDemoMode) return
      mockSource.setScenario(id)
      setScenarioState(id)
    },
    [isDemoMode],
  )

  return {
    connectivityState,
    lastContactAt: sample?.reportedAt ?? null,
    now,
    channels,
    hasActiveAlarm: alarmLabels.length > 0,
    alarmSummary: buildAlarmSummary(alarmLabels),
    lastReportedAlarmSummary: buildLastReportedAlarmSummary(lastReportedAlarmLabels),
    isDemoMode,
    scenario,
    setScenario,
    politeAnnouncement,
    assertiveAnnouncement,
  }
}
