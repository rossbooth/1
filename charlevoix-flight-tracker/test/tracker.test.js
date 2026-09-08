import test from 'node:test';
import assert from 'node:assert/strict';
import { Tracker } from '../server/tracker.js';

const AIRPORT = { icao: 'KCVX', lat: 45.3047, lon: -85.2753, elevationFt: 669 };
const HOME = { lat: 45.3452, lon: -85.2848, elevationFt: 620 };
const T0 = Date.UTC(2026, 6, 4, 14, 0, 0);

const newTracker = () => new Tracker({ airport: AIRPORT, home: HOME });

/** Build one feed record. Position defaults to the runway. */
function ac(over = {}) {
  return {
    hex: 'a1b2c3',
    reg: 'N400CV',
    typeCode: 'C172',
    lat: AIRPORT.lat,
    lon: AIRPORT.lon,
    altBaroFt: 0,
    onGround: false,
    groundSpeedKt: 0,
    trackDeg: 90,
    verticalRateFpm: 0,
    ...over,
  };
}

/** Move north from the airport by a rough number of nautical miles. */
const northOf = (nm) => ({ lat: AIRPORT.lat + nm / 60, lon: AIRPORT.lon });

/** Feed a sequence of [secondsFromStart, aircraftOverrides] into a tracker. */
function run(tracker, steps) {
  const events = [];
  for (const [sec, over] of steps) {
    const now = T0 + sec * 1000;
    events.push(...tracker.ingest([ac(over)], now).events);
  }
  return events;
}

test('takeoff seen from the ground is a confirmed departure', () => {
  const tracker = newTracker();
  const live = run(tracker, [
    [0, { onGround: true, altBaroFt: 669, groundSpeedKt: 5 }],
    [15, { onGround: true, altBaroFt: 669, groundSpeedKt: 35 }],
    [30, { altBaroFt: 1400, groundSpeedKt: 80, verticalRateFpm: 800, ...northOf(0.4) }],
    [45, { altBaroFt: 2200, groundSpeedKt: 95, verticalRateFpm: 900, ...northOf(1.2) }],
  ]);
  const closing = tracker.flush(T0 + 400 * 1000).events;
  const all = [...live, ...closing];

  assert.equal(all.length, 1, 'exactly one event');
  assert.equal(all[0].kind, 'departure');
  assert.equal(all[0].confidence, 'confirmed');
  assert.equal(all[0].airport, 'KCVX');
  assert.equal(all[0].ts, T0 + 30 * 1000, 'timestamped at the moment it got airborne');
});

test('landing seen on the ground is a confirmed arrival', () => {
  const tracker = newTracker();
  const live = run(tracker, [
    [0, { altBaroFt: 3000, groundSpeedKt: 120, verticalRateFpm: -600, ...northOf(4) }],
    [30, { altBaroFt: 1500, groundSpeedKt: 90, verticalRateFpm: -700, ...northOf(1.5) }],
    [60, { onGround: true, altBaroFt: 669, groundSpeedKt: 20 }],
  ]);
  const all = [...live, ...tracker.flush(T0 + 400 * 1000).events];

  assert.equal(all.length, 1);
  assert.equal(all[0].kind, 'arrival');
  assert.equal(all[0].confidence, 'confirmed');
  assert.equal(all[0].ts, T0 + 60 * 1000);
});

test('an approach that drops off the receivers is a likely arrival', () => {
  const tracker = newTracker();
  // Common at small fields: coverage is lost on short final, never on the ground.
  run(tracker, [
    [0, { altBaroFt: 4000, groundSpeedKt: 140, verticalRateFpm: -500, ...northOf(8) }],
    [30, { altBaroFt: 2500, groundSpeedKt: 110, verticalRateFpm: -600, ...northOf(4) }],
    [60, { altBaroFt: 1600, groundSpeedKt: 90, verticalRateFpm: -500, ...northOf(2) }],
    [90, { altBaroFt: 1100, groundSpeedKt: 75, verticalRateFpm: -450, ...northOf(0.8) }],
  ]);
  const events = tracker.flush(T0 + 400 * 1000).events;

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'arrival');
  assert.equal(events[0].confidence, 'likely');
});

test('a track that begins low over the field climbing is a likely departure', () => {
  const tracker = newTracker();
  run(tracker, [
    [0, { altBaroFt: 1400, groundSpeedKt: 85, verticalRateFpm: 700, ...northOf(0.6) }],
    [30, { altBaroFt: 2400, groundSpeedKt: 100, verticalRateFpm: 800, ...northOf(1.8) }],
    [60, { altBaroFt: 3600, groundSpeedKt: 115, verticalRateFpm: 700, ...northOf(3.5) }],
    [90, { altBaroFt: 4800, groundSpeedKt: 130, verticalRateFpm: 600, ...northOf(6) }],
  ]);
  const events = tracker.flush(T0 + 400 * 1000).events;

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'departure');
  assert.equal(events[0].confidence, 'likely');
});

test('an airliner passing overhead is logged as an overflight, not a landing', () => {
  const tracker = newTracker();
  run(tracker, [
    [0, { hex: 'abc111', reg: 'N901DL', altBaroFt: 34000, groundSpeedKt: 460, ...northOf(20) }],
    [60, { hex: 'abc111', reg: 'N901DL', altBaroFt: 34000, groundSpeedKt: 460, ...northOf(8) }],
    [120, { hex: 'abc111', reg: 'N901DL', altBaroFt: 34000, groundSpeedKt: 460, ...northOf(2) }],
    [180, { hex: 'abc111', reg: 'N901DL', altBaroFt: 34000, groundSpeedKt: 460, ...northOf(-10) }],
  ]);
  const events = tracker.flush(T0 + 500 * 1000).events;

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'overflight');
  assert.ok(events[0].closestHomeNm < 12);
});

test('traffic that never comes near the house is not logged at all', () => {
  const tracker = newTracker();
  run(tracker, [
    [0, { hex: 'dddddd', altBaroFt: 9000, groundSpeedKt: 300, ...northOf(-30) }],
    [60, { hex: 'dddddd', altBaroFt: 9000, groundSpeedKt: 300, ...northOf(-33) }],
  ]);
  assert.deepEqual(tracker.flush(T0 + 500 * 1000).events, []);
});

test('pattern work records each circuit separately', () => {
  const tracker = newTracker();
  const events = run(tracker, [
    [0, { onGround: true, altBaroFt: 669, groundSpeedKt: 4 }],
    [30, { altBaroFt: 1500, groundSpeedKt: 75, verticalRateFpm: 700, ...northOf(0.5) }],
    [150, { altBaroFt: 1600, groundSpeedKt: 80, ...northOf(1.2) }],
    [240, { onGround: true, altBaroFt: 669, groundSpeedKt: 25 }],
    [330, { altBaroFt: 1500, groundSpeedKt: 75, verticalRateFpm: 700, ...northOf(0.5) }],
  ]);

  assert.deepEqual(
    events.map((e) => e.kind),
    ['departure', 'arrival', 'departure'],
  );
  assert.ok(events.every((e) => e.confidence === 'confirmed'));
});

test('a sighting summarises how close the aircraft came to the house', () => {
  const tracker = newTracker();
  run(tracker, [
    [0, { altBaroFt: 5000, groundSpeedKt: 200, ...northOf(10) }],
    [60, { altBaroFt: 4000, groundSpeedKt: 180, lat: HOME.lat, lon: HOME.lon }],
    [120, { altBaroFt: 3000, groundSpeedKt: 160, ...northOf(10) }],
  ]);
  const { sightings } = tracker.flush(T0 + 500 * 1000);

  assert.equal(sightings.length, 1);
  assert.ok(sightings[0].closestHomeNm < 0.1, 'passed directly overhead');
  assert.equal(sightings[0].closestHomeTs, T0 + 60 * 1000);
  assert.equal(sightings[0].maxAltFt, 5000);
  assert.equal(sightings[0].maxSpeedKt, 200);
});

test('aircraft go stale and are dropped from the live view', () => {
  const tracker = newTracker();
  run(tracker, [[0, { altBaroFt: 5000, groundSpeedKt: 200, ...northOf(10) }]]);
  assert.equal(tracker.live().length, 1);
  tracker.reap(T0 + 60 * 1000);
  assert.equal(tracker.live().length, 1, 'still fresh after 60s');
  tracker.reap(T0 + 200 * 1000);
  assert.equal(tracker.live().length, 0, 'dropped after the stale window');
});

test('a quick turnaround records both the landing and the takeoff', () => {
  // A short stop -- under the debounce window -- is still two real movements.
  const tracker = newTracker();
  const events = run(tracker, [
    [0, { altBaroFt: 2500, groundSpeedKt: 110, verticalRateFpm: -600, ...northOf(3) }],
    [30, { onGround: true, altBaroFt: 669, groundSpeedKt: 15 }],
    [70, { onGround: true, altBaroFt: 669, groundSpeedKt: 30 }],
    [100, { altBaroFt: 1600, groundSpeedKt: 80, verticalRateFpm: 800, ...northOf(0.7) }],
  ]);

  assert.deepEqual(events.map((e) => e.kind), ['arrival', 'departure']);
  assert.ok(events.every((e) => e.confidence === 'confirmed'));
});

test('a flickering ground signal is not counted as extra takeoffs', () => {
  // Receivers near the runway drop in and out. Repeats of the same kind inside
  // the debounce window collapse into one movement rather than inflating the log.
  const tracker = newTracker();
  const events = run(tracker, [
    [0, { onGround: true, altBaroFt: 669, groundSpeedKt: 5 }],
    [10, { altBaroFt: 1500, groundSpeedKt: 70, verticalRateFpm: 700, ...northOf(0.3) }],
    [20, { onGround: true, altBaroFt: 669, groundSpeedKt: 6 }],
    [30, { altBaroFt: 1500, groundSpeedKt: 70, verticalRateFpm: 700, ...northOf(0.3) }],
    [40, { onGround: true, altBaroFt: 669, groundSpeedKt: 6 }],
    [50, { altBaroFt: 1500, groundSpeedKt: 70, verticalRateFpm: 700, ...northOf(0.3) }],
  ]);

  assert.equal(events.filter((e) => e.kind === 'departure').length, 1, 'one takeoff, not three');
  assert.equal(events.filter((e) => e.kind === 'arrival').length, 1, 'one landing, not two');
});
