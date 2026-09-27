# MQTT contract — Smart Input Module → AWS IoT Core (v1)

Status: agreed 2026-09-27 (device ID, 30 s heartbeat, the "last reported ALARM" marker).
The items in §9 get verified during step 3 (AWS IoT Core setup).

What the ESP32 input module publishes, and the rules every consumer (AWS IoT rules, the web
app) must follow. The firmware, the AWS IoT policy and the web app are all built against
this one document. Change it here first.

**Life-safety rule behind every decision:** this system is supplementary. It must never
show a false "all clear", and it must never silently erase an alarm.

## 1. Scope (v1)

- **Device → cloud only.** The module publishes; it subscribes to nothing. No remote
  commands (no remote reset or silence). A supplementary annunciator must not be able to
  influence anything, and a publish-only device has a much smaller attack surface.
- One device for now, on the bench.

## 2. Identity

**Naming scheme:** `fdas-iot-ane1-<role>-<nn>`, i.e. project, region, role, number.

- `input`: reads the panel's zone contacts and **publishes** (this document).
- `output`: annunciator/lamp boards that **consume** zone states. Reserved as
  `fdas-iot-ane1-output-*`; their subscribe rules get added here before any output board
  joins AWS.

The role is in the name because it's permanent and each role gets a different AWS IoT
policy: input boards may only publish, output boards may only receive.

| Item | Value | Notes |
|---|---|---|
| Device ID | `fdas-iot-ane1-input-01` | Also the AWS IoT **thing name** and the MQTT **client ID**. They must be identical, because the IoT policy uses `${iot:Connection.Thing.ThingName}` to lock each device to its own topics. |
| ESPHome name | `smart-input-module` | The hostname on the local network; unrelated to the above. |

## 3. Topics

| Topic | Payload | QoS | Retained | Published when |
|---|---|---|---|---|
| `fdas/{device_id}/state` | JSON snapshot (§4) | 1 | **yes** | on every input change, and every 30 s (heartbeat) |
| `fdas/{device_id}/status` | `{"v":1,"status":"online"}` or `{"v":1,"status":"offline"}` | 1 | **yes** | `online` right after connecting (birth); `offline` as the last will (unexpected drop) and on clean shutdown |

QoS 1 = at-least-once. AWS IoT Core supports QoS 0 and 1 only.

**Every payload is JSON**, including `status`. Browser MQTT clients (Amplify PubSub) JSON-parse
every message and silently drop anything else. Plain-text `online`/`offline` (the first
version, changed 2026-09-27) never reached the web app.

## 4. State payload

```json
{
  "v": 1,
  "device": "fdas-iot-ane1-input-01",
  "ts": 1790495112,
  "seq": 42,
  "uptime_s": 3601,
  "rssi": -28,
  "inputs": { "z1": false, "z2": true, "z3": false, "z4": false, "mon": false }
}
```

| Field | Type | Meaning |
|---|---|---|
| `v` | int | Schema version. Consumers must reject a major version they don't know. |
| `device` | string | Device ID (redundant with the topic, but makes a stored message self-describing). |
| `ts` | int | **Epoch seconds, UTC**, from SNTP, taken when the snapshot was built. |
| `seq` | int | Increments on every publish; restarts at 0 after reboot. |
| `uptime_s` | int | Seconds since boot. A decrease means the device rebooted. |
| `rssi` | int | Wi-Fi signal in dBm (diagnostics). |
| `inputs.*` | bool | **Raw contact state**: `true` = contact active (energized, after the firmware's `inverted:` setting). Wording like "ALARM"/"ACTIVE" belongs to the app, not the device. |

**Why a full snapshot, not "zone 2 changed" events:** every message carries the whole
truth, so a lost or duplicated message fixes itself with the next one. It's the same
level-triggered idea as the firmware's relay loop. Around 150 bytes per message.

## 5. Device rules

- **D1.** Don't publish `state` until **every** input has a real reading **and** the clock
  is SNTP-synced. (Never a placeholder "normal" at boot.)
- **D2.** Publish a snapshot **immediately** on any input change (after the debounce
  filters), plus a heartbeat snapshot every **30 s**.
- **D3.** Connect with a last will of `offline` (retained) on `status`, publish `online`
  (retained) after connecting, and publish `offline` on clean shutdown/reboot. The last will
  **only fires on unexpected disconnects**, which is why the clean case needs its own message.
- **D4.** Publish only to its own two topics. Subscribe to nothing. (AWS IoT disconnects a
  client that publishes or subscribes outside its policy.)
- **D5.** ESPHome's automatic MQTT features stay off: `discovery: false`,
  `topic_prefix: null` (no auto entity topics or command subscriptions), `log_topic: null`.

## 6. Consumer rules (cloud and web app)

- **C1. Staleness comes from the payload's `ts`, never from arrival time.** A retained
  message is delivered *instantly* to a new subscriber, even if it's hours old. Treat
  `now - ts > 90 s` (3 missed heartbeats) as **OFFLINE**.
- **C2. `status = offline` → OFFLINE immediately**, regardless of `ts`.
- **C3. OFFLINE never erases an alarm.** Every input shows UNKNOWN, but an input whose last
  reported value was `true` keeps a marker: *"last reported ALARM at 09:14"*. If the module
  dies mid-alarm (possibly *because* of the fire), the last thing it said must stay visible.
- **C4.** Drop a snapshot that is older than the one already shown. QoS 1 can deliver
  duplicates, and AWS IoT doesn't guarantee order. Order by **`ts` first** (SNTP-synced, so it
  keeps increasing across reboots), then by `(uptime_s, seq)` for snapshots in the same second.
  A lower `uptime_s` alone does NOT mean newer: a late copy from before the latest message
  looks exactly like a reboot, so only `ts` can tell them apart.
- **C5.** Ignore unknown fields (forward compatibility). Reject an unknown major `v`.

## 7. Timing: what the phone shows if the module loses power mid-alarm

| Time | What happens | Phone shows |
|---|---|---|
| t = 0 | Zone 2 in alarm; module loses power | Zone 2 ALARM |
| **~47 s** (measured) | Broker notices the silence (1.5 × the 30 s keep-alive) and publishes the retained last will `offline` | **OFFLINE**; all inputs UNKNOWN, Zone 2 with "last reported ALARM" |
| 90 s | Backstop: `ts` is now stale (C1). Covers a missed last will or a stuck pipeline | Same, even if the last will never arrived |

## 8. AWS IoT policy (sketch, finalized in step 3)

Least privilege:
- `iot:Connect` only as client ID `${iot:Connection.Thing.ThingName}`;
- `iot:Publish` / `iot:RetainPublish` only to `fdas/${iot:Connection.Thing.ThingName}/state`
  and `.../status`;
- **no** `iot:Subscribe` / `iot:Receive`.

## 9. Verified in step 3 (2026-09-27, breadboard + AWS IoT Core Tokyo)

- **TLS + policy:** ESPHome (ESP-IDF) connects over mutual TLS on port 8883 with the CSR-based
  certificate. The least-privilege policy accepted every publish (no disconnects), so nothing
  outside D4/D5 was published.
- **Keep-alive 30 s** is accepted. Pulling the power produced the retained `offline` last
  will after **47 s** (≈ 1.5 × keep-alive).
- **End-to-end latency:** a button press showed up in AWS's retained `state` within about
  1 s. The release showed up about 1 s later (the 1 s slow-to-clear filter plus transit).
- **Retained messages:** `state` (QoS 1, snapshot with a fresh `ts`) and `status`
  (`online`) are both readable with `aws iot-data get-retained-message`.
- **Pricing (Tokyo):** $1.20 per million messages, $0.096 per million connection-minutes
  → about **$0.12 per device per month** at a 30 s heartbeat.

## 10. Decisions and open items

- **Decided:** device ID `fdas-iot-ane1-input-01` (scheme `fdas-iot-ane1-<role>-<nn>`), a 30 s heartbeat with a 90 s offline threshold, and
  the "last reported ALARM" marker (C3, implemented in the web app in step 4).
- **Open:** what the output ESP32 does. If it's the lamp annunciator, add its subscribe
  rules and policy here before it joins AWS.
- **Open:** whether the cloud also records **AWS IoT lifecycle events** (connected/disconnected). AWS
  recommends them over the last will for accurate connectivity tracking, but they're
  cloud-side only, so they don't change this contract.
