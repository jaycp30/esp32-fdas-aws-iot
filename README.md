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
| `web/` | FDAS Monitoring web app (React + Vite + TypeScript). Currently a mockup with simulated data. |
| `amplify.yml` | AWS Amplify Hosting build spec (monorepo, app root `web/`). |

The AWS IoT Core backend will be added later.

### Updating the firmware config

The ESPHome Device Builder edits its working copy in `~/esphome/`. After changing it there,
copy it into the repo (the script refuses if a credential was written inline), then review
and commit:

```bash
firmware/sync-from-esphome.sh
```

## Status

Early prototype. The input module firmware runs on a breadboard prototype and passes its
bench test (all built zone channels read correctly). The web app runs on simulated data;
nothing is connected to a real panel yet.

## Credits

- **Jake** ([@jpicardal814-commits](https://github.com/jpicardal814-commits)) is the
  project's **hardware engineer**. He designed the input module circuit and
  PCB, built the breadboard prototype, and wrote the initial ESP32 firmware (ESPHome) that
  `firmware/` builds on.
