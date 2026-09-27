# FDAS Monitoring

A clickable mockup of the FDAS (Fire Detection and Alarm System) remote
annunciator web app. It shows what the finished product will look like once
the ESP32 Smart Input Module is reporting real zone states through AWS IoT
Core - for now, every reading on screen comes from a mock data source, not
hardware.

**This app is a supplementary remote annunciator.** The physical fire panel
is, and remains, the real alarm system. The UI is built around that: it never
shows a state it isn't sure about (see "Offline handling" below).

## Running it

```
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`). Other
useful commands:

```
npm run build    # type-checks with tsc, then produces dist/
npm run preview  # serves the production build locally
npm run lint     # runs oxlint
```

## Demo scenarios

Because there is no backend yet, the app ships with a **Demo** scenario
switcher so you can see every state without real hardware. Open it from the
overflow menu (the ⋮ icon in the top-right of the app bar) - it opens a
bottom sheet clearly labelled "DEMO — SCENARIO" so it's never mistaken for a
real product feature. The five scenarios:

1. **All normal** - every input quiet, module online. The default state on
   load, with a simulated heartbeat that refreshes "Last update" roughly
   every 10 seconds.
2. **Zone 2 fire alarm** - Zone 02 in alarm, everything else normal.
3. **Multiple alarms (Z1 + Z3)** - two zones in alarm at the same time, to
   check the layout doesn't break when more than one card lights up.
4. **Trouble on Monitor** - the MON input reports a supervisory fault.
5. **Module offline** - no recent telemetry. Every zone shows UNKNOWN
   (never a stale "last known good" value), and a banner tells the operator
   to check the physical panel directly.

Switching scenarios only changes what the mock feed publishes; nothing here
reaches real hardware or AWS.

## Life-safety behaviour worth knowing about

- **Staleness rule**: data older than `HEARTBEAT_TIMEOUT_MS` (90 seconds,
  defined once in `src/data/constants.ts`) is treated as OFFLINE, and every
  zone falls back to UNKNOWN. This is implemented in exactly one place
  (`src/data/deriveDeviceState.ts`'s `deriveDeviceStatus` /
  `deriveChannelViewModels`) so it can never be accidentally bypassed by a
  component reading a stale value directly.
- **Cards never reorder.** Z1-Z4 and MON always render in the same physical
  order, alarm or not - see the comment in `src/components/ZoneList.tsx` for
  why.
- **Colour is never the only signal.** Every status pairs a colour with an
  icon shape and a text label (see `src/components/ZoneCard.tsx`).

## Swapping the mock feed for the real thing

Everything above the data layer only ever talks to the `useZoneFeed()` hook
(`src/hooks/useZoneFeed.ts`), which returns plain view models
(`ChannelViewModel[]`, `DeviceStatus`, etc. - see `src/types/zone.ts`). The
mock device itself lives behind one module, `src/data/mockDeviceSource.ts`,
which exposes a single `subscribe(listener)` function.

To wire up the real ESP32 module once it's reporting through AWS IoT Core /
Amplify Data:

1. Write a new module (e.g. `src/data/iotDeviceSource.ts`) that exposes the
   same `subscribe(listener): () => void` shape, publishing `DeviceSample`
   objects (`{ receivedAt, channels }`) as real telemetry arrives.
2. Change the single import at the top of `src/hooks/useZoneFeed.ts` from
   `./data/mockDeviceSource` to the new module.
3. Delete `src/data/mockDeviceSource.ts` and `src/data/scenarios.ts` (and the
   Demo menu, if it's no longer wanted) once the real feed is trustworthy.

No component in `src/components/` needs to change - they only ever render
the `ChannelViewModel[]` / `DeviceStatus` the hook hands them.

## Dependencies

- **react / react-dom** - the UI framework.
- **tailwindcss + @tailwindcss/vite** - utility CSS, compiled at build time
  (Tailwind v4's Vite plugin, no separate PostCSS config needed).
- **lottie-react** - renders the three small status animations
  (`src/lottie/*.json`). Specifically imports the `LottieLight` build
  (`lottie-web`'s expressions-free engine), since none of this app's
  animations use expressions - see the code comment in
  `src/components/StatusMotion.tsx`.

No router, state-management library, or component library - the app is one
route and its state fits in a single hook.
