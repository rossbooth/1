import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { Store } from '../server/store.js';
import { AdsbClient } from '../server/adsb.js';
import { TrackerService } from '../server/service.js';
import { createApp } from '../server/app.js';
import { importRegistry } from '../server/faa.js';
import { DEFAULT_CONFIG } from '../server/config.js';

const FIXTURE_DIR = new URL('../fixtures/faa-sample', import.meta.url).pathname;
// Use the current clock: the activity endpoint filters by the local day.
const T0 = Date.now();

/** A tracker wired to a feed we control, mounted on a real HTTP server. */
async function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvx-api-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  importRegistry(db, FIXTURE_DIR);

  const config = structuredClone(DEFAULT_CONFIG);
  // Keep test writes out of the project's own config.json.
  config.configPath = path.join(dir, 'config.json');
  const store = new Store(db);
  let feed = [];
  const client = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }],
    fetchImpl: async () => ({ ac: feed }),
  });
  const service = new TrackerService({ config, store, client });
  const server = createApp({ service, store, db, config }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    config,
    service,
    store,
    setFeed: (next) => { feed = next; },
    poll: (at) => service.poll(at),
    get: async (p) => {
      const res = await fetch(base + p);
      return { status: res.status, body: await res.json() };
    },
    post: async (p, payload) => {
      const res = await fetch(base + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json() };
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

/** A raw feed record, positioned a given number of miles north of the field. */
function feedAircraft(over = {}, northNm = 0) {
  const { airport } = DEFAULT_CONFIG;
  return {
    hex: 'a4acfc',
    r: 'N400CV',
    t: 'C172',
    lat: airport.lat + northNm / 60,
    lon: airport.lon,
    alt_baro: 3000,
    gs: 110,
    track: 10,
    baro_rate: 0,
    ...over,
  };
}

test('the live endpoint reports position, owner and where to look', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  h.setFeed([feedAircraft({ alt_baro: 4000 }, 3)]);
  await h.poll(T0);

  const { status, body } = await h.get('/api/live');
  assert.equal(status, 200);
  assert.equal(body.aircraft.length, 1);

  const [ac] = body.aircraft;
  assert.equal(ac.registration, 'N400CV');
  assert.equal(ac.owner, 'CHARLEVOIX AVIATION LLC', 'joined to the FAA register');
  assert.equal(ac.ownerType, 'LLC');
  assert.equal(ac.aircraft, 'CESSNA 172N');
  assert.equal(ac.yearManufactured, 1979);
  assert.ok(ac.distanceFromHomeMi > 0);
  assert.ok(/^Look /.test(ac.viewingHint), `viewing hint was "${ac.viewingHint}"`);
  assert.ok(ac.compassFromHome.length <= 3);
  assert.equal(body.status.lastError, null);
});

test('a takeoff shows up in the activity log with its owner', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  h.setFeed([feedAircraft({ alt_baro: 'ground', gs: 5 }, 0)]);
  await h.poll(T0);
  h.setFeed([feedAircraft({ alt_baro: 2000, gs: 85, baro_rate: 800 }, 0.5)]);
  await h.poll(T0 + 30000);

  const { body } = await h.get('/api/activity?days=1&kind=airport');
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].kind, 'departure');
  assert.equal(body.events[0].confidence, 'confirmed');
  assert.equal(body.events[0].registration, 'N400CV');
  assert.equal(body.events[0].owner, 'CHARLEVOIX AVIATION LLC');
  assert.equal(body.counts.departure, 1);
});

test('an aircraft can be looked up by tail number or ICAO address', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  const byTail = await h.get('/api/aircraft/N400CV');
  assert.equal(byTail.status, 200);
  assert.equal(byTail.body.registry.owner, 'CHARLEVOIX AVIATION LLC');
  assert.equal(byTail.body.hex, 'a4acfc');

  const byHex = await h.get('/api/aircraft/a4acfc');
  assert.equal(byHex.body.registry.owner, 'CHARLEVOIX AVIATION LLC');

  const nonsense = await h.get('/api/aircraft/not-a-plane');
  assert.equal(nonsense.status, 404);
});

test('search finds aircraft by owner name', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  const { body } = await h.get('/api/search?q=charlevoix%20aviation');
  assert.equal(body.registry[0].registration, 'N400CV');
});

test('moving the house pin is saved and changes the distances', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  h.setFeed([feedAircraft({}, 5)]);
  await h.poll(T0);
  const before = (await h.get('/api/live')).body.aircraft[0].distanceFromHomeNm;

  const moved = await h.post('/api/config/home', { lat: DEFAULT_CONFIG.airport.lat, lon: DEFAULT_CONFIG.airport.lon });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.home.approximate, false, 'no longer a guess once moved');

  await h.poll(T0 + 15000);
  const after = (await h.get('/api/live')).body.aircraft[0].distanceFromHomeNm;
  assert.notEqual(before, after);
  assert.ok(Math.abs(after - 5) < 0.3, `aircraft 5 nm north of the field should be ~5 nm away, got ${after}`);
});

test('a bad house position is rejected', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  assert.equal((await h.post('/api/config/home', { lat: 999, lon: 0 })).status, 400);
  assert.equal((await h.post('/api/config/home', {})).status, 400);
});

test('the overhead view only lists aircraft that are actually in the air nearby', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  h.setFeed([
    feedAircraft({ hex: 'a4acfc', r: 'N400CV', alt_baro: 'ground', gs: 3 }, 0),
    feedAircraft({ hex: 'a061d9', r: 'N12345', alt_baro: 5000 }, 2),
    feedAircraft({ hex: 'a9e53c', r: 'N737BA', alt_baro: 35000 }, 35),
  ]);
  await h.poll(T0);

  const { body } = await h.get('/api/overhead?within=15');
  const tails = body.aircraft.map((a) => a.registration);
  assert.deepEqual(tails, ['N12345'], 'the parked one and the distant one are excluded');
});

test('stats summarise the log', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  h.setFeed([feedAircraft({ alt_baro: 'ground', gs: 5 }, 0)]);
  await h.poll(T0);
  h.setFeed([feedAircraft({ alt_baro: 2000, gs: 85, baro_rate: 800 }, 0.5)]);
  await h.poll(T0 + 30000);

  const { body } = await h.get('/api/stats');
  assert.equal(body.aircraftKnown, 1);
  assert.equal(body.events, 1);
  assert.equal(body.registryRows, 4);
  assert.ok(Array.isArray(body.daily));
  assert.ok(Array.isArray(body.regulars));
});

test('the page and its assets are served', async (t) => {
  const h = await harness();
  t.after(() => h.close());

  for (const [p, type] of [
    ['/', 'text/html'],
    ['/app.js', 'javascript'],
    ['/styles.css', 'text/css'],
    ['/vendor/leaflet/leaflet.js', 'javascript'],
    ['/vendor/leaflet/leaflet.css', 'text/css'],
  ]) {
    const res = await fetch(h.base + p);
    assert.equal(res.status, 200, `${p} should be served`);
    assert.match(res.headers.get('content-type'), new RegExp(type), `${p} content type`);
  }
});

test('when every data source fails the page still loads and says so', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvx-down-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  const config = structuredClone(DEFAULT_CONFIG);
  config.configPath = path.join(dir, 'config.json');
  const store = new Store(db);
  const service = new TrackerService({
    config,
    store,
    client: new AdsbClient({
      sources: [{ id: 'adsbfi', enabled: true }],
      fetchImpl: async () => { throw new Error('network unreachable'); },
    }),
  });
  const server = createApp({ service, store, db, config }).listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;

  await assert.rejects(() => service.poll(T0));

  const live = await (await fetch(`${base}/api/live`)).json();
  assert.deepEqual(live.aircraft, []);
  assert.match(live.status.lastError, /network unreachable/);

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 503, 'health check reports the outage');
});
