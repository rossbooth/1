import express from 'express';
import { searchRegistry, registryCount } from './faa.js';
import { nNumberToHex } from './nnumber.js';
import { distanceNm, bearing } from './geo.js';
import { saveConfig } from './config.js';

const DAY_MS = 86400000;

/**
 * Timestamp of local midnight in `tz`, `daysAgo` days back.
 * Done by subtracting the local time of day, then correcting once, so it stays
 * right across the two days a year when the clocks change.
 */
function startOfLocalDay(daysAgo = 0, tz = 'America/Detroit') {
  const timeOfDayMs = (at) => {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(at)
      .reduce((a, part) => ({ ...a, [part.type]: part.value }), {});
    return ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 + (at.getTime() % 1000);
  };

  const target = new Date(Date.now() - daysAgo * DAY_MS);
  let midnight = new Date(target.getTime() - timeOfDayMs(target));
  const drift = timeOfDayMs(midnight);
  // A clock change can leave us an hour off; nudge back onto midnight.
  if (drift !== 0) midnight = new Date(midnight.getTime() - (drift > 12 * 3600000 ? drift - DAY_MS : drift));
  return midnight.getTime();
}

export function createRouter({ service, store, db, config }) {
  const router = express.Router();
  const tz = config.timezone ?? 'America/Detroit';

  router.get('/config', (req, res) => {
    res.json({
      home: config.home,
      airport: config.airport,
      radiusNm: config.radiusNm,
      pollSeconds: config.pollSeconds,
      timezone: tz,
      registryLoaded: registryCount(db),
      homeToAirport: {
        nm: Number(distanceNm(config.home.lat, config.home.lon, config.airport.lat, config.airport.lon).toFixed(2)),
        bearing: Math.round(bearing(config.home.lat, config.home.lon, config.airport.lat, config.airport.lon)),
      },
    });
  });

  // Move the house pin. Only the home location is editable from the browser.
  router.post('/config/home', express.json(), (req, res) => {
    const { lat, lon, label, elevationFt } = req.body ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return res.status(400).json({ error: 'lat and lon must be valid coordinates' });
    }
    const home = {
      ...config.home,
      lat: Number(lat),
      lon: Number(lon),
      approximate: false,
      ...(label ? { label: String(label).slice(0, 80) } : {}),
      ...(Number.isFinite(elevationFt) ? { elevationFt: Number(elevationFt) } : {}),
    };
    saveConfig({ home }, { base: config, filePath: config.configPath });
    Object.assign(config.home, home);
    service.tracker.home = config.home;
    return res.json({ home: config.home });
  });

  router.get('/live', (req, res) => {
    res.json(service.liveSnapshot());
  });

  router.get('/activity', (req, res) => {
    const days = Math.min(Number(req.query.days) || 1, 90);
    const since = startOfLocalDay(days - 1, tz);
    res.json({
      since,
      days,
      counts: store.eventCount({ since }),
      events: store.events({
        kind: req.query.kind ?? 'all',
        since,
        q: req.query.q || undefined,
        limit: Math.min(Number(req.query.limit) || 200, 500),
      }),
    });
  });

  router.get('/events', (req, res) => {
    res.json({
      events: store.events({
        kind: req.query.kind ?? 'all',
        hex: req.query.hex || undefined,
        q: req.query.q || undefined,
        since: req.query.since ? Number(req.query.since) : undefined,
        limit: Math.min(Number(req.query.limit) || 100, 500),
        offset: Number(req.query.offset) || 0,
      }),
    });
  });

  router.get('/events/:id/track', (req, res) => {
    const track = store.trackFor(Number(req.params.id));
    if (!track) return res.status(404).json({ error: 'No saved track for that flight' });
    return res.json({ track });
  });

  router.get('/stats', (req, res) => {
    res.json({
      ...store.stats(),
      daily: store.dailyCounts(14, tz),
      today: store.eventCount({ since: startOfLocalDay(0, tz) }),
      week: store.eventCount({ since: startOfLocalDay(6, tz) }),
      regulars: store.frequentVisitors(15, Date.now() - 90 * DAY_MS),
      status: service.status,
    });
  });

  router.get('/aircraft/:key', (req, res) => {
    const key = String(req.params.key).trim();
    const hex = /^[0-9a-f]{6}$/i.test(key) ? key.toLowerCase() : nNumberToHex(key);
    if (!hex) return res.status(404).json({ error: `"${key}" is not a tail number or ICAO address we recognise` });

    const details = store.details(hex, /^N/i.test(key) ? key.toUpperCase() : null);
    const live = service.liveSnapshot().aircraft.find((a) => a.hex === hex) ?? null;
    return res.json({
      ...details,
      live,
      history: store.events({ hex, limit: 100 }),
    });
  });

  router.get('/search', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ registry: [], events: [] });
    return res.json({
      registry: searchRegistry(db, q, 25),
      events: store.events({ q, limit: 50 }),
    });
  });

  // "What is that plane?" -- traffic ordered by how easy it is to see right now.
  router.get('/overhead', (req, res) => {
    const maxNm = Number(req.query.within) || 15;
    const snapshot = service.liveSnapshot();
    const visible = snapshot.aircraft
      .filter((a) => a.distanceFromHomeNm <= maxNm && !a.onGround)
      .slice(0, 25);
    res.json({ aircraft: visible, generatedAt: snapshot.generatedAt, status: snapshot.status });
  });

  router.get('/health', (req, res) => {
    const s = service.status;
    const healthy = Boolean(s.lastSuccessAt) && Date.now() - s.lastSuccessAt < 5 * 60 * 1000;
    res.status(healthy ? 200 : 503).json({ healthy, ...s });
  });

  return router;
}

export { startOfLocalDay };
