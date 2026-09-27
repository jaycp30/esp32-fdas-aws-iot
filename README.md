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

## Deploying the web app

The web app is hosted on AWS Amplify (region `ap-northeast-1`). Live mockup:
https://main.d3ar5fu2alxp7w.amplifyapp.com

**Pushing to `main` does not deploy.** Automatic builds are turned off on purpose, so commits
that only touch `firmware/`, docs or `.gitignore` never rebuild the site. After pushing a change
under `web/` (or to `amplify.yml`), start the deployment yourself:

```bash
aws amplify start-job --app-id d3ar5fu2alxp7w --branch-name main --job-type RELEASE --region ap-northeast-1
```

This builds and deploys the latest commit on `main` (about 1–2 minutes). To check the result
(`SUCCEED` means it's live):

```bash
aws amplify list-jobs --app-id d3ar5fu2alxp7w --branch-name main --max-items 1 --region ap-northeast-1
```

Both commands need AWS credentials for the account that hosts the app.

## Status

Early prototype. The input module runs on a breadboard prototype, passes its bench test, and
publishes zone state to AWS IoT Core (Tokyo). A button press reaches AWS in about 1 s, and a
power loss shows as `offline` after about 47 s. The web app still runs on simulated data; wiring
it to the live feed is next. Nothing is connected to a real panel yet.

## Credits

- **Jake** ([@jpicardal814-commits](https://github.com/jpicardal814-commits)) is the
  project's **hardware engineer**. He designed the input module circuit and
  PCB, built the breadboard prototype, and wrote the initial ESP32 firmware (ESPHome) that
  `firmware/` builds on.
