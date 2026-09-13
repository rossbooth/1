/* ---------------------------------------------------------------------------
   Runtime for the standalone single-file build.

   There is no server in this build, so the real modules bundled above -- geo,
   adsb, tracker -- are driven directly in the page and answer the same JSON the
   Express API would. Takeoffs and landings are genuinely inferred by
   tracker.js from the aircraft's motion; only the plumbing is different.

   Live positions are tried first. A browser can only read the ADS-B feeds if
   they send CORS headers; when they do not, this falls back to the project's
   demo traffic and says so in the status line rather than sitting empty.
--------------------------------------------------------------------------- */
(function () {
  const TZ = 'America/Detroit';
  const round = (v, p) =>
    v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(p));

  const CONFIG = {
    home: { label: 'Home', lat: 45.3452, lon: -85.2848, elevationFt: 620, approximate: true },
    airport: {
      icao: 'KCVX', iata: 'CVX', name: 'Charlevoix Municipal Airport',
      lat: 45.3047, lon: -85.2753, elevationFt: 669,
    },
    radiusNm: 40,
    pollSeconds: 15,
    timezone: TZ,
    registryLoaded: 0,
  };

  // The dragged house pin is the one setting worth keeping between opens.
  try {
    const saved = JSON.parse(localStorage.getItem('cvx.home') || 'null');
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
      Object.assign(CONFIG.home, { lat: saved.lat, lon: saved.lon, approximate: false });
    }
  } catch { /* private window, or storage disabled */ }

  const recomputeHomeToAirport = () => {
    const d = distanceNm(CONFIG.home.lat, CONFIG.home.lon, CONFIG.airport.lat, CONFIG.airport.lon);
    CONFIG.homeToAirport = {
      nm: round(d, 2),
      bearing: round(bearing(CONFIG.home.lat, CONFIG.home.lon, CONFIG.airport.lat, CONFIG.airport.lon), 0),
    };
  };
  recomputeHomeToAirport();

  const EVENTS = [];
  const META = new Map();
  const SEEN = new Map();
  let nextId = 1;

  const status = {
    running: true, lastPollAt: null, lastSuccessAt: null, lastError: null,
    source: null, sourceLabel: null, aircraftCount: 0, polls: 0, failures: 0,
  };

  const metaFor = (hex) => META.get(hex) ?? { typeCode: null, description: null, registration: null };

  function addEvent(e) {
    const m = metaFor(e.hex);
    EVENTS.unshift({
      id: nextId++,
      ...e,
      registration: e.reg ?? m.registration,
      typeCode: m.typeCode,
      description: m.description,
      aircraft: m.description,
      operator: null, military: false, manufacturer: null, model: null,
      yearManufactured: null, owner: null, ownerCity: null, ownerState: null, ownerLocation: null,
    });
  }

  const tracker = new Tracker({ airport: CONFIG.airport, home: CONFIG.home, store: { onEvent: addEvent } });

  // Live first; the demo feed is the fallback when the browser cannot reach
  // the feeds (CORS, or no network).
  const liveClient = new AdsbClient({
    sources: [
      { id: 'adsbfi', enabled: true },
      { id: 'adsblol', enabled: true },
      { id: 'airplaneslive', enabled: true },
    ],
  });
  const demoClient = new AdsbClient({
    sources: [{ id: 'adsbfi', enabled: true }],
    fetchImpl: demoFeed({ airport: CONFIG.airport }),
  });

  let useDemo = false;

  async function poll() {
    const now = Date.now();
    status.lastPollAt = now;
    status.polls += 1;
    try {
      let res;
      if (!useDemo) {
        try {
          res = await liveClient.aircraftNear(CONFIG.airport.lat, CONFIG.airport.lon, CONFIG.radiusNm);
        } catch (err) {
          useDemo = true;
          console.warn('Live feeds unreachable from the browser; using demo traffic.', err.message);
        }
      }
      if (useDemo) {
        res = await demoClient.aircraftNear(CONFIG.airport.lat, CONFIG.airport.lon, CONFIG.radiusNm);
      }
      const { aircraft, source, sourceLabel } = res;
      for (const ac of aircraft) {
        META.set(ac.hex, {
          typeCode: ac.typeCode ?? null,
          description: ac.desc ?? null,
          registration: ac.reg ?? null,
        });
        const s = SEEN.get(ac.hex) ?? { firstSeen: now, lastSeen: now, visits: 1 };
        s.lastSeen = now;
        SEEN.set(ac.hex, s);
      }
      tracker.ingest(aircraft, now);
      tracker.reap(now);
      Object.assign(status, {
        lastSuccessAt: now,
        lastError: null,
        source,
        sourceLabel: useDemo ? 'demo traffic (live feeds unreachable)' : sourceLabel,
        aircraftCount: aircraft.length,
      });
    } catch (err) {
      status.failures += 1;
      status.lastError = err.message;
      tracker.reap(now);
    }
  }

  function liveSnapshot(now = Date.now()) {
    const { home, airport } = CONFIG;
    const aircraft = tracker.live().filter(Boolean).map((ac) => {
      const distHome = ac.distanceFromHomeNm ?? distanceNm(home.lat, home.lon, ac.lat, ac.lon);
      const brg = bearing(home.lat, home.lon, ac.lat, ac.lon);
      const elev = ac.altBaroFt === null ? null : elevationAngle(distHome, ac.altBaroFt, home.elevationFt);
      const m = metaFor(ac.hex);
      return {
        hex: ac.hex,
        registration: ac.reg ?? m.registration,
        callsign: ac.flight,
        typeCode: ac.typeCode ?? m.typeCode,
        manufacturer: null, model: null,
        aircraft: ac.desc ?? m.description ?? null,
        owner: ac.ownOp ?? null,
        ownerCity: null, ownerState: null, ownerLocation: null, ownerType: null,
        yearManufactured: ac.year ?? null, seats: null, engineType: null,
        military: ac.military ?? false,
        lat: ac.lat, lon: ac.lon,
        altitudeFt: ac.altBaroFt,
        onGround: ac.onGround,
        groundSpeedKt: ac.groundSpeedKt,
        trackDeg: ac.trackDeg,
        verticalRateFpm: ac.verticalRateFpm,
        squawk: ac.squawk,
        emergency: ac.emergency,
        distanceFromHomeNm: round(distHome, 2),
        distanceFromHomeMi: round(nmToMiles(distHome), 1),
        bearingFromHome: round(brg, 0),
        compassFromHome: compassPoint(brg),
        elevationAngleDeg: elev === null ? null : round(elev, 0),
        viewingHint: elev === null ? null : viewingHint(distHome, brg, elev),
        distanceFromAirportNm: round(
          ac.distAirportNm ?? distanceNm(airport.lat, airport.lon, ac.lat, ac.lon), 2),
        atAirport: (ac.distAirportNm ?? 99) <= 1.5 &&
          (ac.onGround || (ac.aglFt !== null && ac.aglFt < 1500)),
        ageSeconds: Math.round((now - (ac.updatedAt ?? now)) / 1000),
        visits: SEEN.get(ac.hex)?.visits ?? null,
      };
    }).sort((a, b) => a.distanceFromHomeNm - b.distanceFromHomeNm);
    return { aircraft, status, generatedAt: now };
  }

  const dayKey = (ts) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ts));

  function startOfLocalDay(daysAgo) {
    const key = dayKey(Date.now() - daysAgo * 86400000);
    const guess = new Date(`${key}T00:00:00Z`).getTime();
    for (const shift of [0, 4, 5, 6, 7, 8]) {
      const t = guess + shift * 3600000;
      if (dayKey(t) === key && dayKey(t - 60000) !== key) return t;
    }
    return guess;
  }

  const counts = (list) => {
    const c = { departure: 0, arrival: 0, overflight: 0 };
    for (const e of list) if (c[e.kind] !== undefined) c[e.kind] += 1;
    return c;
  };

  function activity(days, kind) {
    const since = startOfLocalDay(days - 1);
    const inRange = EVENTS.filter((e) => e.ts >= since);
    let list = inRange;
    if (kind === 'airport') list = list.filter((e) => e.kind !== 'overflight');
    else if (kind && kind !== 'all') list = list.filter((e) => e.kind === kind);
    return { since, days, counts: counts(inRange), events: list.slice(0, 200) };
  }

  function stats() {
    const buckets = new Map();
    const cutoff = Date.now() - 14 * 86400000;
    for (const e of EVENTS) {
      if (e.ts < cutoff || e.kind === 'overflight') continue;
      const day = dayKey(e.ts);
      const b = buckets.get(day) ?? { day, departures: 0, arrivals: 0 };
      if (e.kind === 'departure') b.departures += 1; else b.arrivals += 1;
      buckets.set(day, b);
    }
    const byHex = new Map();
    for (const e of EVENTS) {
      const r = byHex.get(e.hex) ?? {
        hex: e.hex, registration: e.registration, movements: 0, lastSeen: 0,
        typeCode: e.typeCode, manufacturer: null, model: null, aircraft: null,
        owner: null, ownerCity: null, ownerState: null, ownerLocation: null,
      };
      r.movements += 1;
      r.lastSeen = Math.max(r.lastSeen, e.ts);
      byHex.set(e.hex, r);
    }
    return {
      aircraftKnown: META.size,
      events: EVENTS.length,
      sightings: SEEN.size,
      registryRows: 0,
      firstEvent: EVENTS.length ? EVENTS[EVENTS.length - 1].ts : null,
      daily: [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day)),
      today: counts(EVENTS.filter((e) => e.ts >= startOfLocalDay(0))),
      week: counts(EVENTS.filter((e) => e.ts >= startOfLocalDay(6))),
      regulars: [...byHex.values()].sort((a, b) => b.movements - a.movements).slice(0, 10),
      status,
    };
  }

  function aircraftDetail(key) {
    const hex = /^[0-9a-f]{6}$/i.test(key) ? key.toLowerCase() : (nNumberToHex(key) || '');
    const m = metaFor(hex);
    const live = liveSnapshot().aircraft.find((a) => a.hex === hex) ?? null;
    const history = EVENTS.filter((e) => e.hex === hex).slice(0, 100);
    if (!live && !history.length && !META.has(hex)) return null;
    const seen = SEEN.get(hex);
    return {
      hex,
      registration: m.registration ?? hexToNNumber(hex),
      isUsRegistered: Boolean(hexToNNumber(hex)),
      seenBefore: seen ? { visits: seen.visits, firstSeen: seen.firstSeen, lastSeen: seen.lastSeen } : null,
      feed: { typeCode: m.typeCode, description: m.description },
      registry: null,
      live,
      history,
    };
  }

  function search(q) {
    const term = q.trim().toUpperCase();
    if (term.length < 2) return { registry: [], events: [] };
    return {
      registry: [],
      events: EVENTS.filter((e) => (e.registration ?? '').toUpperCase().includes(term)).slice(0, 50),
    };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/api/')) return realFetch(input, init);

    const [path, qs] = url.split('?');
    const q = new URLSearchParams(qs || '');
    const json = (payload, code = 200) =>
      new Response(JSON.stringify(payload), { status: code, headers: { 'content-type': 'application/json' } });

    if ((init?.method || 'GET').toUpperCase() === 'POST') {
      if (path.endsWith('/api/config/home')) {
        const body = JSON.parse(init.body);
        Object.assign(CONFIG.home, { lat: body.lat, lon: body.lon, approximate: false });
        recomputeHomeToAirport();
        try {
          localStorage.setItem('cvx.home', JSON.stringify({ lat: body.lat, lon: body.lon }));
        } catch { /* nothing to do; it just will not persist */ }
        return json({ home: CONFIG.home });
      }
      return json({ ok: true });
    }

    if (path.endsWith('/api/config')) return json(CONFIG);
    if (path.endsWith('/api/live')) return json(liveSnapshot());
    if (path.endsWith('/api/health')) return json({ healthy: Boolean(status.lastSuccessAt), ...status });
    if (path.endsWith('/api/stats')) return json(stats());
    if (path.endsWith('/api/overhead')) {
      const snap = liveSnapshot();
      const within = Number(q.get('within')) || 15;
      return json({
        aircraft: snap.aircraft.filter((a) => a.distanceFromHomeNm <= within && !a.onGround).slice(0, 25),
        generatedAt: snap.generatedAt,
        status,
      });
    }
    if (path.includes('/api/activity')) {
      return json(activity(Math.min(Number(q.get('days')) || 1, 90), q.get('kind') ?? 'all'));
    }
    if (path.includes('/api/events')) return json({ events: EVENTS.slice(0, 100) });
    if (path.includes('/api/search')) return json(search(q.get('q') ?? ''));

    const m = path.match(/\/api\/aircraft\/([^/?]+)/);
    if (m) {
      const detail = aircraftDetail(decodeURIComponent(m[1]));
      return detail ? json(detail) : json({ error: 'not found' }, 404);
    }
    return json({ error: 'not found' }, 404);
  };

  window.__standaloneReady = poll();
  setInterval(poll, CONFIG.pollSeconds * 1000);
})();
