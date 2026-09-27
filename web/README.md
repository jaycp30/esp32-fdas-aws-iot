# FDAS Monitoring

The FDAS (Fire Detection and Alarm System) remote annunciator web app. It
shows live zone states reported by the ESP32 Smart Input Module through AWS
IoT Core, over a guest (unauthenticated) MQTT subscription - see
`../docs/mqtt-contract.md` for the wire contract this app is built against.

**This app is a supplementary remote annunciator.** The physical fire panel
is, and remains, the real alarm system. The UI is built around that: it never
shows a state it isn't sure about (see "Life-safety behaviour" below).

## Running it

**Live** (default) needs a deployed backend first - `web/amplify_outputs.json`
must exist (see "Local backend development" below); without it, `npm run
build`/`npm run dev` will fail to resolve that import.

```
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`). Append
`?demo=1` to that URL to run entirely on simulated data instead (see "Demo
scenarios" below) - this works with no backend and no AWS credentials at all.
Other useful commands:

```
npm run build    # type-checks with tsc, then produces dist/
npm run preview  # serves the production build locally
npm run lint     # runs oxlint
npm test         # runs the vitest unit tests
```

## Local backend development

This app's backend (`amplify/`) is an Amplify Gen 2 project: a Cognito
identity pool with guest access, and a least-privilege AWS IoT policy on the
guest role (see `amplify/backend.ts`). To get your own `amplify_outputs.json`
for local live-mode development:

```
npx ampx sandbox
```

**This creates real, billable AWS resources** in your account (a Cognito user
pool/identity pool, IAM roles, and a small custom-resource Lambda that reads
your account's AWS IoT endpoint) - it is not a local-only simulation. It
writes `amplify_outputs.json` to this directory (gitignored - never commit
it) and keeps running, redeploying on every source change, until you stop it
with Ctrl-C. Run `npx ampx sandbox delete` to tear the sandbox down again.
`?demo=1` mode needs none of this.

## Demo scenarios

The app ships with a **Demo** scenario switcher so you can see every state
without real hardware or a backend - open the app with `?demo=1` in the URL,
then use the overflow menu (the ⋮ icon in the top-right of the app bar). A
"DEMO — SIMULATED DATA" label in the header, and the menu's own "DEMO —
SCENARIO" heading, make sure simulated data is never mistaken for live
telemetry. The scenarios:

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
6. **Offline after an alarm** - Zone 02 alarms, then the module goes silent.
   Demonstrates contract rule C3: Zone 02 keeps a "Last reported ALARM at
   HH:MM" marker even while UNKNOWN.

Switching scenarios only changes what the mock feed publishes; nothing here
reaches real hardware or AWS.

## Life-safety behaviour worth knowing about

The contract rules referenced below (C1-C5) are defined in
`../docs/mqtt-contract.md` §6; this section says where each one lives in
code.

- **C1 - staleness comes from the payload, never arrival time.** A retained
  MQTT message can arrive instantly even when it's hours old, so a stale
  reading must never look fresh just because the browser just received it.
  `DeviceSample.reportedAt` (`src/types/zone.ts`) is always the device's own
  `ts` field for live data (set in `src/data/liveDeviceSource.ts`'s
  `toDeviceSample`), never receive time. Data older than
  `HEARTBEAT_TIMEOUT_MS` (90 seconds, `src/data/constants.ts`) is OFFLINE -
  see `deriveDeviceStatus` in `src/data/deriveDeviceState.ts`, the one place
  that comparison happens.
- **C2 - an explicit "offline" wins immediately.** `deriveDeviceStatus` also
  takes a `reportedOffline` flag, set from the device's retained `status`
  topic (`src/data/liveDeviceSource.ts`'s `handleStatusMessage`) - see that
  function's comment for an important caveat about a browser PubSub library
  limitation with this topic's plain-text payload.
- **C3 - OFFLINE never erases an alarm.** Every channel forced to UNKNOWN
  still carries `lastReportedActiveAt` when its last known reading was
  true (alarm/active) - computed in `deriveChannelViewModels`
  (`src/data/deriveDeviceState.ts`), rendered as a "Last reported ALARM/
  ACTIVE at HH:MM" marker in `src/components/ZoneCard.tsx`, and summarised
  in the connectivity banner via `buildLastReportedAlarmSummary`.
- **C4 - dedupe and reboot detection.** `src/data/liveDeviceSource.ts`'s
  `isNewerSnapshot` compares each incoming snapshot's `(uptime_s, seq)`
  against the last one accepted, dropping late/duplicate QoS 1 redeliveries
  while always accepting a decreased `uptime_s` (a reboot).
- **C5 - unknown fields are ignored, unknown versions are rejected.**
  `parseStatePayload` (`src/data/liveDeviceSource.ts`) only ever reads the
  named fields it expects, and rejects (returns `null`, logging a
  `console.warn`) anything whose `v` isn't the literal number `1`.
- **CONNECTING and VIEWER DISCONNECTED** are distinct from the device being
  OFFLINE - see `ConnectivityState` (`src/types/zone.ts`) and
  `deriveConnectivityState` (`src/data/deriveDeviceState.ts`) for how the
  three failure modes (no sample yet, this browser's own AWS IoT connection
  down, and the device itself being offline/stale) combine into the one
  value every component renders from.
- **Cards never reorder.** Z1-Z4 and MON always render in the same physical
  order, alarm or not - see the comment in `src/components/ZoneList.tsx` for
  why.
- **Colour is never the only signal.** Every status pairs a colour with an
  icon shape and a text label (see `src/components/ZoneCard.tsx`).

## Architecture: live data and the mock feed

Everything above the data layer only ever talks to the `useZoneFeed()` hook
(`src/hooks/useZoneFeed.ts`), which returns plain view models
(`ChannelViewModel[]`, `ConnectivityState`, etc. - see `src/types/zone.ts`).
No component in `src/components/` needs to know or care which data source is
active.

`useZoneFeed` picks between two modules that expose the same shape
(`subscribe`, `subscribeConnectionPhase`, `subscribeDeviceReportedStatus`):

- **`src/data/liveDeviceSource.ts`** (default) - subscribes to the real
  device's two MQTT topics over AWS IoT Core via `@aws-amplify/pubsub`, as
  described in "Life-safety behaviour" above.
- **`src/data/mockDeviceSource.ts`** (`?demo=1` only) - the simulated feed
  behind the Demo scenario switcher (`src/data/scenarios.ts`).

## Dependencies

- **react / react-dom** - the UI framework.
- **tailwindcss + @tailwindcss/vite** - utility CSS, compiled at build time
  (Tailwind v4's Vite plugin, no separate PostCSS config needed).
- **lottie-react** - renders the three small status animations
  (`src/lottie/*.json`). Specifically imports the `LottieLight` build
  (`lottie-web`'s expressions-free engine), since none of this app's
  animations use expressions - see the code comment in
  `src/components/StatusMotion.tsx`.
- **aws-amplify + @aws-amplify/pubsub** - the guest MQTT connection to AWS
  IoT Core (`src/data/liveDeviceSource.ts`) and `Amplify.configure()`
  (`src/main.tsx`).
- **vitest** (dev only) - unit tests for the parsing/derivation logic above
  (`src/data/*.test.ts`).

No router or component library - the app is one route and its state fits in
a single hook. `web/amplify/` (the Gen 2 backend) additionally uses
`@aws-amplify/backend`, `aws-cdk-lib`, and `constructs` - dev dependencies
only, never shipped to the browser.
