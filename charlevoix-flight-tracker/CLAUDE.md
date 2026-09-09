# Charlevoix Flight Tracker

Local web app that watches Charlevoix Municipal Airport (KCVX): live aircraft
on a map, a log of takeoffs and landings, and the registered owner of each
aircraft. Built for one household — an observer watching the sky from a fixed
point on Lake Shore Drive.

## Commands

```bash
npm start                      # run the tracker; opens a browser at :4903
npm run demo                   # invented traffic, no network needed
npm test                       # 45 tests, ~1s
npm run import-registry        # download + import the FAA aircraft register
npm run import-registry -- <path>   # import a zip/folder you already have
```

Force a database driver with `SQLITE_DRIVER=node` or `SQLITE_DRIVER=better`.
Skip the browser launch with `--no-open` or `OPEN=0`. Override the port with
`PORT=8080`.

## Layout

```
server/
  adsb.js       three community ADS-B feeds, tried in order with failover
  tracker.js    decides what each aircraft is DOING (the hard part)
  service.js    the poll loop; joins live positions to registry data
  store.js      all the SQL
  db.js         schema
  sqlite.js     picks better-sqlite3 or node:sqlite at runtime
  faa.js        FAA register import + lookup
  nnumber.js    ICAO hex <-> N-number codec
  geo.js        distance, bearing, elevation angle, viewing hints
  routes.js     the JSON API
public/         the site: plain HTML/CSS/JS, no build step
```

## Things worth knowing before changing anything

**Takeoffs and landings are inferred, not reported.** KCVX is non-towered and
publishes no schedule. `tracker.js` runs a per-aircraft state machine over
ground/air transitions near the field. Tracks that cut out low on approach are
recorded with `confidence: 'likely'` and shown as PROBABLE in the UI — that
path matters, because ground-level receiver coverage at a small field is poor
and a large share of real movements arrive that way. Thresholds live in
`RULES` at the top of the file; every one of them has a test.

**The event debounce is per-kind, deliberately.** A landing followed by a
takeoff 70 seconds later is a real quick turnaround and must record both. Two
takeoffs 20 seconds apart is a jittery ground signal. Making the debounce
global breaks the first case — that bug shipped once already.

**Two SQLite drivers.** `better-sqlite3` is native and needs a compiler when
prebuilds don't match the Node version; it is an *optional* dependency, and
`node:sqlite` is the fallback. Any new SQL must work on both — notably,
node:sqlite rejects a named parameter that is absent from the statement, which
better-sqlite3 tolerates. Run `SQLITE_DRIVER=node npm test` before pushing.

**Tests must not write to the project's `config.json`.** `POST /api/config/home`
persists settings; test harnesses set `config.configPath` to a temp file. See
`test/api.test.js`.

**Owner names are `UPPER CASE` in the FAA data.** Softening happens in the
browser (`titleCase` in `public/app.js`), and only for names — never for
aircraft models, or `PC-12` becomes `Pc-12`. City and state are sent as
separate fields so the state code survives.

**`demoFeed` takes an injectable clock**, so a whole session can be replayed
deterministically. Do not make it read `Date.now()` directly again.

## Testing

`node:test`, no framework. Tests are named as sentences describing behaviour,
not method names. The tracker tests build synthetic flight paths; the API
tests boot the real Express app against a scripted feed. Prefer adding a case
to the existing describe-by-behaviour style over asserting internals.

## Data sources

Live positions: adsb.fi, adsb.lol, airplanes.live (free, volunteer-run, no
key). Owners: the FAA registry zip, imported once into SQLite. Note that some
aircraft are absent by design — no ADS-B fitted, or enrolled in the FAA's LADD
/ Privacy ICAO Address programmes.
