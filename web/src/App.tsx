import { useRef, useState } from 'react'
import { AppBar } from './components/AppBar'
import { AlarmBanner } from './components/AlarmBanner'
import { ConnectionChip } from './components/ConnectionChip'
import { DemoMenu } from './components/DemoMenu'
import { LiveRegions } from './components/LiveRegions'
import { OfflineBanner } from './components/OfflineBanner'
import { SectionPill } from './components/SectionPill'
import { ZoneList } from './components/ZoneList'
import { useZoneFeed } from './hooks/useZoneFeed'
import { formatRelativeTime } from './utils/formatRelativeTime'

function App() {
  const feed = useZoneFeed()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Note: these two banners can never both be visible at once. Going
  // OFFLINE forces every channel to UNKNOWN (see deriveChannelViewModels),
  // and UNKNOWN can never be ALARM - so hasActiveAlarm is always false while
  // offline. That's the "never show a false all-clear" rule paying off here
  // too: we don't need extra logic to decide which banner wins.
  const lastUpdateText =
    feed.lastContactAt === null ? 'no data yet' : formatRelativeTime(feed.lastContactAt, feed.now)

  return (
    <div className="min-h-screen bg-canvas">
      <AppBar onOpenMenu={() => setIsMenuOpen(true)} menuButtonRef={menuButtonRef} />
      <LiveRegions polite={feed.politeAnnouncement} assertive={feed.assertiveAnnouncement} />

      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ConnectionChip deviceStatus={feed.deviceStatus} lastContactAt={feed.lastContactAt} now={feed.now} />
          <p className="font-mono text-xs text-ink-soft">Last update: {lastUpdateText}</p>
        </div>

        {feed.deviceStatus === 'OFFLINE' && (
          <OfflineBanner lastContactAt={feed.lastContactAt} now={feed.now} />
        )}

        {feed.hasActiveAlarm && feed.alarmSummary && <AlarmBanner summary={feed.alarmSummary} />}

        <SectionPill>Zones alarm indicator</SectionPill>

        <ZoneList channels={feed.channels} />
      </main>

      <DemoMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        scenario={feed.scenario}
        onSelectScenario={(id) => {
          feed.setScenario(id)
          setIsMenuOpen(false)
        }}
        returnFocusRef={menuButtonRef}
      />
    </div>
  )
}

export default App
