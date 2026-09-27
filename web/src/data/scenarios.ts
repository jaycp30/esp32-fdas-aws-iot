import { CHANNEL_ORDER } from './constants'
import type { ChannelSample, ScenarioId } from '../types/zone'

/** Human-readable label + description shown in the Demo scenario switcher. */
export interface ScenarioMeta {
  id: ScenarioId
  label: string
  description: string
}

export const SCENARIOS: ScenarioMeta[] = [
  { id: 'all-normal', label: 'All normal', description: 'Every input quiet, module online.' },
  { id: 'zone2-alarm', label: 'Zone 2 fire alarm', description: 'Zone 02 in alarm, everything else normal.' },
  { id: 'multi-alarm', label: 'Multiple alarms (Z1 + Z3)', description: 'Two zones in alarm at once.' },
  { id: 'monitor-trouble', label: 'Trouble on Monitor', description: 'MON reports a supervisory fault.' },
  { id: 'offline', label: 'Module offline', description: 'No recent telemetry - zone states unknown.' },
  {
    id: 'offline-after-alarm',
    label: 'Offline after an alarm',
    description: 'Zone 02 alarmed, then the module went silent - shows the "last reported ALARM" marker (C3).',
  },
]

/**
 * Builds one scenario's channel readings from CHANNEL_ORDER plus a sparse
 * map of overrides, so every scenario definition below only has to spell
 * out the channels that differ from "normal" instead of repeating all five
 * every time.
 */
function buildChannels(
  overrides: Partial<Record<(typeof CHANNEL_ORDER)[number]['id'], ChannelSample['raw']>>,
): ChannelSample[] {
  return CHANNEL_ORDER.map((channel) => {
    const raw = overrides[channel.id] ?? 'normal'
    return channel.kind === 'zone'
      ? { kind: 'zone', id: channel.id as 'z1' | 'z2' | 'z3' | 'z4', raw: raw as 'normal' | 'alarm' | 'trouble' }
      : { kind: 'monitor', id: 'mon' as const, raw: raw as 'normal' | 'active' | 'trouble' }
  })
}

/**
 * Raw channel readings for each demo scenario. The "offline" scenario still
 * carries a (last-known-normal) reading - it doesn't matter what it says,
 * because deriveChannelViewModels forces every channel to UNKNOWN whenever
 * the device is OFFLINE, and the module going offline is simulated by
 * backdating the sample's timestamp in mockDeviceSource, not by changing
 * these readings.
 *
 * "offline-after-alarm" is the one exception: its reading DOES matter, on
 * purpose. It's still forced to UNKNOWN the same way, but
 * deriveChannelViewModels also reads the last reading underneath that
 * UNKNOWN state to decide whether to show a C3 "last reported ALARM"
 * marker - so this scenario needs an actual alarm baked into the backdated
 * sample for that marker to have something to show.
 */
export const SCENARIO_CHANNELS: Record<ScenarioId, ChannelSample[]> = {
  'all-normal': buildChannels({}),
  'zone2-alarm': buildChannels({ z2: 'alarm' }),
  'multi-alarm': buildChannels({ z1: 'alarm', z3: 'alarm' }),
  'monitor-trouble': buildChannels({ mon: 'trouble' }),
  offline: buildChannels({}),
  'offline-after-alarm': buildChannels({ z2: 'alarm' }),
}
