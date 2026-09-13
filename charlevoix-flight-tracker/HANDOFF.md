# Handoff — 13 September 2026

Written by the cloud session that built this, for whichever session picks it
up next. Everything below is committed to
`claude/charlevoix-flight-tracker-1nuola`.

## Where things stand

The app is complete and tested. It has **never been run against the live
flight feeds** — the environment it was built in blocked them at the network
layer (`HTTP 403` from adsb.fi, adsb.lol and airplanes.live). Everything was
verified against saved samples and a simulated feed instead.

So the single most valuable thing to do is start it on a real network and find
out whether the live path works.

## Start here

```bash
git pull && npm run setup
```

That checks Node, reinstalls cleanly, runs the tests, and starts the server.
Then open http://localhost:4903 and look at the status dot, top right.

- **Green** — the live feeds answer. This is the thing that has never been
  confirmed. If it is green, say so; that closes the biggest open question.
- **Red** — the message names which feeds failed and why. Diagnose from there:
  the feeds are volunteer-run and individually unreliable, which is why there
  are three, but all three failing at once points at local DNS, a VPN, or a
  firewall.

## Two environment problems already hit and solved

Do not re-diagnose these from scratch:

1. **`npm error EACCES` on `~/.npm/_cacache`** — an old npm bug leaves
   root-owned files in the cache. Fix: `sudo chown -R $(id -u):$(id -g) ~/.npm`.
   Already done on this machine.
2. **`better-sqlite3` fails to build, `'climits' file not found`** — it is a
   native module with no prebuilt binary for Node 24, so it compiled from
   source and failed for want of Xcode command line tools. It is now an
   *optional* dependency and the app falls back to Node's built-in
   `node:sqlite`. **Install errors mentioning better-sqlite3 are expected and
   harmless.** The startup banner prints which driver won.

## Once it is running

In rough priority order:

1. **Confirm the status dot is green** and that real aircraft appear. Nothing
   else matters until this is true.
2. **Drag the 🏠 pin to 4903 Lake Shore Drive.** It currently sits at an
   approximate coordinate I guessed from the address; every distance, compass
   bearing and "look this way" hint is measured from it. It saves on drop.
3. **`npm run import-registry`** — a ~90 MB download from the FAA that turns
   tail numbers into owner names. One time.
4. **Leave it running for a few days**, then check the activity log against
   reality. This is the real open question — see below.

## The open question: are the detection thresholds right?

`server/tracker.js` infers takeoffs and landings from position reports,
because KCVX is non-towered and publishes no schedule. The thresholds in
`RULES` (what counts as airborne, how close to the field, what climb rate
reads as a departure) are *reasoned from how aircraft actually behave, not
calibrated against KCVX traffic*. They are all unit-tested, so changing one
tells you immediately if you broke a case.

Signs they need tuning, once there is real data:

- Lots of `PROBABLE` and few confirmed → ground coverage at the field is
  poor; consider widening `likelyArrivalNm` / `likelyArrivalAglFt`.
- Movements logged for aircraft that obviously just flew past → tighten
  `nearFieldNm` or raise `likelyDepartureAglFt`.
- Known movements missing entirely → the aircraft may have no ADS-B at all,
  which no amount of tuning fixes. Cross-check against one of the feed sites
  before changing thresholds.

A good validation: watch the field for an hour, note what you see by eye, and
compare to the log.

## Orientation

`CLAUDE.md` in this folder covers the architecture and the non-obvious
constraints — read it first. Short version: `server/tracker.js` is the
interesting part, `public/` is a no-build-step site, and any new SQL must work
on both SQLite drivers (`SQLITE_DRIVER=node npm test`).

## What was deliberately not done

- **No deployment.** It runs locally. Getting it onto a small always-on host
  would give it a public URL and a gap-free log; nothing in the code prevents
  that, it just was not set up.
- **No PR.** The branch is pushed; nothing is open against it.
