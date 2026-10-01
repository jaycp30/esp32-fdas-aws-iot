# ESP32 FDAS Remote Annunciator

A **supplementary** remote annunciator for a fire detection and alarm system (FDAS) panel.
An ESP32 input module reads the panel's zone relay contacts through optocouplers and reports
zone status over the internet to a web app on phones and laptops.

> **Not a life-safety device.** The fire alarm panel remains the code-required alarm system.
> This project only mirrors its zone relay outputs for convenience. It must never be the only
> way an alarm is noticed. When the input module loses contact, the app shows zone states as
> **unknown**, never as "normal".

## Repository layout

| Path | What it is |
|------|------------|
| `firmware/` | ESP32 input module firmware: an ESPHome device configuration (ESP-IDF framework). Credentials are `!secret` references only; real values live in a local `secrets.yaml` that is never committed. |
| `docs/mqtt-contract.md` | The MQTT contract: what the input module publishes to AWS IoT Core and the rules every consumer follows. |
| `infra/iot-input-device.yaml` | CloudFormation for one input board's AWS IoT identity: thing, certificate (from a locally generated key) and a publish-only, least-privilege policy. |
| `infra/amplify-service-role.yaml` | CloudFormation for the IAM role Amplify Hosting uses to deploy the web app's backend. |
| `web/` | FDAS Monitoring web app (React + Vite + TypeScript) with an Amplify Gen 2 backend (`web/amplify/`). Shows live zone states from AWS IoT Core; `?demo=1` shows simulated data. |
| `amplify.yml` | AWS Amplify Hosting build spec (monorepo, app root `web/`). |

How a board is enrolled in AWS IoT Core, step by step by hand:
[wiki: AWS IoT Device Enrollment](https://github.com/jaycp30/esp32-fdas-aws-iot/wiki/AWS-IoT-Device-Enrollment).

### Updating the firmware config

The ESPHome Device Builder edits its working copy in `~/esphome/`. After changing it there,
copy it into the repo (the script refuses if a credential was written inline), then review
and commit:

```bash
firmware/sync-from-esphome.sh
```

## Bill of materials

The hardware exists in two stages:

- **Input module PCB:** designed in EasyEDA by Jake, not yet built. Its parts have exact part
  numbers.
- **Breadboard prototype:** the one running today. It uses the PCB's circuit (optocouplers into a
  74HC04 inverter) but has fewer channels (Zone 1–3 and MON), and most of its parts have no
  recorded part number.

### Input module PCB (design "ESP32 v4")

Part numbers come from the EasyEDA design. The LCSC numbers were checked on lcsc.com on
2026-10-01.

| Ref | Qty | Part | Manufacturer | Manufacturer part | LCSC |
|-----|-----|------|--------------|-------------------|------|
| U1 | 1 | ESP32 development board, 38-pin | Espressif | ESP32-DevKitC | [C571180](https://www.lcsc.com/product-detail/C571180.html) |
| U2–U6 | 5 | Optocoupler, transistor output, DIP-4 | DDF | PC817C-FEL-D | [C50229496](https://www.lcsc.com/product-detail/C50229496.html) |
| U8 | 1 | Hex inverter, DIP-14 | Lingxing (LX) | SN74HC04N(LX) | [C22436641](https://www.lcsc.com/product-detail/C22436641.html) |
| U7 | 1 | RGB LED, 5 mm, common cathode | Inolux | HV-5RGB60 | [C5656084](https://www.lcsc.com/product-detail/C5656084.html) |
| LED1–LED5 | 5 | Red LED, 5 mm | Everlight | 333-2SURD/S530-A3 | [C87271](https://www.lcsc.com/product-detail/C87271.html) |
| KEY1 | 1 | Tactile switch, 6 × 6 mm, through-hole | Korean Hroparts Elec | K2-1102DP-E4SW-04 | [C136684](https://www.lcsc.com/product-detail/C136684.html) |
| H1, H2 | 2 | Female header, 1 × 20, 2.54 mm (socket for U1) | BOOMELE | 2.54-1*20P | [C50984](https://www.lcsc.com/product-detail/C50984.html) |
| `5V+`, `5V-`, `24V+`, `24V-` | 4 | Male header, 1 × 2, 2.54 mm (supply-select jumpers) | Ckmtw | B-2100S02P-A110 | [C124375](https://www.lcsc.com/product-detail/C124375.html) |
| — | 2 | Jumper shunt, 2.54 mm, for the supply-select headers | not specified | | |
| Z1–Z4, MON, IN, PWR5V, PWR5V/24V, RLY-PWR | 9 | Screw terminal, 2-pin, 5.00 mm pitch | not specified | | |
| R1–R5, R11–R16, R25, R26 | 13 | Resistor, 10 kΩ, axial | not specified | | |
| R6–R10 | 5 | Resistor, 1 kΩ, axial, **at least 1 W** for 24V mode | not specified | | |
| R17 | 1 | Resistor, 22 Ω, axial (RGB blue) | not specified | | |
| R18 | 1 | Resistor, 68 Ω, axial (RGB red) | not specified | | |
| R19 | 1 | Resistor, 47 Ω, axial (RGB green) | not specified | | |
| — | 4 | M2 mounting screws | not specified | | |

- **R6–R10:** EasyEDA labels them "820", but their value is 1 kΩ. In 24V mode each one
  dissipates about 0.43 W, so a standard ¼ W resistor will overheat.
- **Supply jumpers:** fit `5V+` and `5V-`, *or* `24V+` and `24V-`. **Never fit `5V+` and `24V+`
  together**: that puts 24V onto the ESP32 board's 5V rail and destroys it.
- **A newer revision** exists as a schematic only. It drops the 74HC04 and gives each channel a
  100 Ω (5V) or 1.5 kΩ (24V) series resistor, selected by jumpers. This table will change when
  that design is finalised.

### Breadboard prototype (running today)

| Part | Qty | What's known |
|------|-----|--------------|
| ESP32 development board, 38-pin, USB-C | 1 | A DevKitC-compatible clone, not Espressif's own board. The module is marked "ESP-32D" with no maker named. esptool reads the chip as **ESP32-D0WD-V3 revision 3.1**, with 4 MB flash and a 40 MHz crystal. It uses a CP2102 USB-serial chip. No vendor SKU. |
| Screw-terminal breakout for the 38-pin board | 1 | Generic, no SKU |
| Optocoupler, DIP-4 | 4 | PC817 per the design; the maker isn't readable in photos |
| Hex inverter, DIP-14 | 1 | 74HC04 per the design; the maker isn't readable in photos |
| Red LED, 5 mm | 4 | No part number |
| Tactile button, 6 × 6 mm | 4 | Stands in for the panel's zone relay contacts |
| Resistors | | Values follow the design; not verified from photos |
| Solderless breadboard and jumper wires | | Generic |

There's no Zone 4 channel on the breadboard: GPIO35 is tied to GND so it reads a steady "off".
The bench also has relay modules and a 24V → 5V buck converter, but those aren't part of the
input module and their models aren't recorded.

## Deploying the web app

The web app is hosted on AWS Amplify (region `ap-northeast-1`). Live app:
https://main.d3ar5fu2alxp7w.amplifyapp.com

**Pushing to `main` does not deploy.** Automatic builds are turned off on purpose, so commits
that only touch `firmware/`, docs or `.gitignore` never rebuild the site. After pushing a change
under `web/` (or to `amplify.yml`), start the deployment yourself:

```bash
aws amplify start-job --app-id d3ar5fu2alxp7w --branch-name main --job-type RELEASE --region ap-northeast-1
```

This deploys the backend (`web/amplify/`) and then builds the site from the latest commit on
`main` (about 4 minutes). To check the result (`SUCCEED` means it's live):

```bash
aws amplify list-jobs --app-id d3ar5fu2alxp7w --branch-name main --max-items 1 --region ap-northeast-1
```

Both commands need AWS credentials for the account that hosts the app.

## AWS cost (running 24/7)

Almost all of the cost is AWS IoT Core. Tokyo (`ap-northeast-1`) prices, checked 2026-09-30:
**$1.20 per million messages** and **$0.096 per million connection-minutes**. Messages are
metered in 5 KB steps; ours are about 200 bytes, so each counts as one. A message is billed
once going **in** (board → AWS), and once more for **each viewer** it's delivered **out** to.

For a full 31-day month (44,640 minutes), with the 30 s heartbeat from
[`docs/mqtt-contract.md`](docs/mqtt-contract.md):

| What | Usage per month | Cost per month |
|------|-----------------|----------------|
| Input board: heartbeat every 30 s | 89,280 messages in | $0.107 |
| Input board: always connected | 44,640 connection-minutes | $0.004 |
| **One board, nobody watching** | | **≈ $0.11** |
| Each browser left open 24/7 | +89,280 messages out, +44,640 connection-minutes | +$0.11 |
| **One board + one always-open screen** | | **≈ $0.22** |

- **Zone changes** add one message each: a few hundred a month on the bench, fractions of a cent.
- **What could raise it:** a faulty input that chatters (e.g. a loose wire) publishes on every
  change, up to about one message a second, which is roughly 2.7 million messages or about $3.20 a
  month. A sudden jump in message count is worth investigating.
- **Viewers:** each open browser adds about $0.11 a month *while it stays open*; a phone checked a
  few times a day costs next to nothing.
- **Other services:** the Cognito guest identity pool is free. CloudFormation and IAM are free.
  Amplify Hosting build minutes (about 4 per deploy) and hosting for a site this small fall within
  its free allowance.
- **AWS Free Tier:** accounts under 12 months old get 2,250,000 connection-minutes and 500,000
  messages a month free, which covers everything above.

## Status

Early prototype, working end to end on the bench: the input module (breadboard) publishes zone
state to AWS IoT Core (Tokyo), and the web app shows it live. A button press turns the zone red on
a phone in about 1 s; a power loss shows the module as offline (zones UNKNOWN, with the last
reported alarm kept) after about 47 s. Viewing is read-only guest access, fine for bench data;
sign-in is required before connecting a real panel. Add `?demo=1` to the URL for simulated data.
Nothing is connected to a real panel yet.

## Credits

- **Jake** ([@jpicardal814-commits](https://github.com/jpicardal814-commits)) is the
  project's **hardware engineer**. He designed the input module circuit and
  PCB, built the breadboard prototype, and wrote the initial ESP32 firmware (ESPHome) that
  `firmware/` builds on.
