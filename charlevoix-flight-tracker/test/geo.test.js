import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceNm, bearing, compassPoint, elevationAngle, viewingHint, nmToMiles } from '../server/geo.js';
import { startOfLocalDay } from '../server/routes.js';

const KCVX = { lat: 45.3047, lon: -85.2753 };

test('distance and bearing agree with known values', () => {
  assert.equal(Math.round(distanceNm(KCVX.lat, KCVX.lon, KCVX.lat, KCVX.lon)), 0);
  // One minute of latitude is one nautical mile, by definition.
  assert.ok(Math.abs(distanceNm(45, 0, 45 + 1 / 60, 0) - 1) < 0.01);
  assert.ok(Math.abs(bearing(45, 0, 46, 0) - 0) < 0.01, 'due north');
  assert.ok(Math.abs(bearing(45, 0, 45, 1) - 89.6) < 0.6, 'due east, less convergence');
});

test('compass points cover the full circle', () => {
  assert.equal(compassPoint(0), 'N');
  assert.equal(compassPoint(360), 'N');
  assert.equal(compassPoint(90), 'E');
  assert.equal(compassPoint(180), 'S');
  assert.equal(compassPoint(270), 'W');
  assert.equal(compassPoint(315), 'NW');
  assert.equal(compassPoint(-45), 'NW', 'negative bearings wrap');
});

test('elevation angle matches simple geometry', () => {
  // One nautical mile out and 6076 ft up is a 45 degree look angle.
  assert.ok(Math.abs(elevationAngle(1, 6076, 0) - 45) < 0.1);
  assert.equal(elevationAngle(5, 100, 600), 0, 'below the observer is on the horizon');
  assert.equal(elevationAngle(0, 5000, 0), 90, 'directly overhead');
});

test('viewing hints describe where to look, and give up when too far', () => {
  assert.match(viewingHint(2, 315, 40), /^Look NW, high overhead/);
  assert.match(viewingHint(2, 0, 80), /straight up/);
  assert.match(viewingHint(10, 180, 4), /low on the S horizon/);
  assert.equal(viewingHint(60, 180, 4), null, 'too far to pick out');
});

test('nautical miles convert to statute miles', () => {
  assert.ok(Math.abs(nmToMiles(1) - 1.1508) < 0.001);
});

test('the local day starts at local midnight, including across a clock change', () => {
  const tz = 'America/Detroit';
  const fmt = (t) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(t));

  // 200 days back crosses at least one daylight-saving transition.
  for (const daysAgo of [0, 1, 7, 30, 200, 300]) {
    assert.equal(fmt(startOfLocalDay(daysAgo, tz)), '00:00:00', `${daysAgo} days ago`);
  }
  assert.ok(startOfLocalDay(0, tz) > startOfLocalDay(1, tz), 'today starts after yesterday');
});
