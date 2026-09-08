import test from 'node:test';
import assert from 'node:assert/strict';
import { AdsbClient, normalizeAircraft } from '../server/adsb.js';

const KCVX = { lat: 45.3047, lon: -85.2753 };
const near = (over = {}) => ({ hex: 'a4acfc', lat: KCVX.lat, lon: KCVX.lon, alt_baro: 3000, ...over });

test('a feed record is normalised into the shape the tracker expects', () => {
  const ac = normalizeAircraft({
    hex: 'A4ACFC', r: 'N400CV', t: 'C172', flight: 'N400CV ', alt_baro: 3500,
    gs: 95, track: 210, baro_rate: -400, squawk: '1200', seen_pos: 2,
    lat: 45.3, lon: -85.27, dbFlags: 1,
  }, 'adsbfi');

  assert.equal(ac.hex, 'a4acfc', 'hex is lower-cased');
  assert.equal(ac.reg, 'N400CV');
  assert.equal(ac.flight, 'N400CV', 'callsign is trimmed');
  assert.equal(ac.altBaroFt, 3500);
  assert.equal(ac.onGround, false);
  assert.equal(ac.verticalRateFpm, -400);
  assert.equal(ac.military, true, 'dbFlags bit 1 marks military');
  assert.equal(ac.source, 'adsbfi');
});

test('"ground" altitude and missing fields are handled', () => {
  const onGround = normalizeAircraft({ hex: 'abc123', lat: 1, lon: 2, alt_baro: 'ground' }, 's');
  assert.equal(onGround.onGround, true);
  assert.equal(onGround.altBaroFt, 0);

  const sparse = normalizeAircraft({ hex: 'abc123', lat: 1, lon: 2 }, 's');
  assert.equal(sparse.altBaroFt, null, 'unknown stays unknown rather than becoming zero');
  assert.equal(sparse.groundSpeedKt, null);
  assert.equal(sparse.reg, null);
});

test('records without a usable position are discarded', () => {
  assert.equal(normalizeAircraft({ hex: 'abc123' }, 's'), null, 'no position');
  assert.equal(normalizeAircraft({ lat: 1, lon: 2 }, 's'), null, 'no identifier');
  assert.equal(normalizeAircraft(null, 's'), null);
});

test('a dead source falls through to the next one', async () => {
  const tried = [];
  const client = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }, { id: 'adsblol', enabled: true }, { id: 'airplaneslive', enabled: true }],
    fetchImpl: async (url) => {
      tried.push(new URL(url).host);
      if (url.includes('adsb.fi')) throw new Error('down');
      if (url.includes('adsb.lol')) return { nonsense: true };
      return { ac: [near()] };
    },
  });

  const result = await client.aircraftNear(KCVX.lat, KCVX.lon, 40);
  assert.deepEqual(tried, ['opendata.adsb.fi', 'api.adsb.lol', 'api.airplanes.live']);
  assert.equal(result.sourceLabel, 'airplanes.live');
  assert.equal(result.aircraft.length, 1);
});

test('the source that worked last is tried first next time', async () => {
  const tried = [];
  const client = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }, { id: 'adsblol', enabled: true }],
    fetchImpl: async (url) => {
      tried.push(new URL(url).host);
      if (url.includes('adsb.fi')) throw new Error('down');
      return { ac: [near()] };
    },
  });

  await client.aircraftNear(KCVX.lat, KCVX.lon, 40);
  tried.length = 0;
  await client.aircraftNear(KCVX.lat, KCVX.lon, 40);
  assert.deepEqual(tried, ['api.adsb.lol'], 'no wasted call to the dead source');
});

test('when every source fails the error names them all', async () => {
  const client = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }, { id: 'adsblol', enabled: true }],
    fetchImpl: async () => { throw new Error('timeout'); },
  });
  await assert.rejects(
    () => client.aircraftNear(KCVX.lat, KCVX.lon, 40),
    /adsb\.fi: timeout.*adsb\.lol: timeout/s,
  );
});

test('aircraft outside the radius are dropped and the rest sorted by distance', async () => {
  const client = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }],
    fetchImpl: async () => ({ ac: [
      near({ hex: 'far001', lat: 46.5 }),                 // ~72 nm away
      near({ hex: 'mid001', lat: KCVX.lat + 10 / 60 }),   // ~10 nm
      near({ hex: 'close1' }),                            // at the field
    ] }),
  });

  const { aircraft } = await client.aircraftNear(KCVX.lat, KCVX.lon, 40);
  assert.deepEqual(aircraft.map((a) => a.hex), ['close1', 'mid001'], 'the far one is outside the circle');
});

test('an empty sky is a valid answer, but an unrecognised body is not', async () => {
  const quiet = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }],
    fetchImpl: async () => ({ ac: [], total: 0 }),
  });
  assert.deepEqual((await quiet.aircraftNear(KCVX.lat, KCVX.lon, 40)).aircraft, [], 'no aircraft, no error');

  const garbage = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }],
    fetchImpl: async () => ({ message: 'rate limited' }),
  });
  await assert.rejects(() => garbage.aircraftNear(KCVX.lat, KCVX.lon, 40), /unrecognised response/);
});
