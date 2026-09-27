/**
 * Renders the five channel cards in their fixed physical order.
 *
 * This order is NEVER changed - not sorted by severity, not filtered, not
 * re-grouped. Operators learn these positions the way they'd learn the
 * layout of lamps on a physical annunciator panel: "Zone 2 is the second
 * one down." If an alarm silently jumped its card to the top of the list,
 * that muscle memory would work against the operator at exactly the moment
 * it matters most. An alarm gets a strong visual treatment (see ZoneCard),
 * never a new position.
 *
 * `channels` already arrives in CHANNEL_ORDER order from
 * deriveChannelViewModels, and mapping over it here with no `.sort()` /
 * `.filter()` is what keeps that guarantee - so if you're tempted to add
 * one, don't.
 */
import { ZoneCard } from './ZoneCard'
import type { ChannelViewModel } from '../types/zone'

export function ZoneList({ channels }: { channels: ChannelViewModel[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Zone and monitor status">
      {channels.map((channel) => (
        <ZoneCard key={channel.id} channel={channel} />
      ))}
    </ul>
  )
}
