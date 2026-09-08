// The running tracker: polls the live feed, hands positions to the state
// machine, and keeps an enriched snapshot ready for the browser.

import { AdsbClient } from './adsb.js';
import { Tracker } from './tracker.js';
import { distanceNm, bearing, compassPoint, elevationAngle, nmToMiles, viewingHint } from './geo.js';

const DETAIL_CACHE_MS = 10 * 60 * 1000;

export class TrackerService {
  constructor({ config, store, client }) {
    this.config = config;
    this.store = store;
    this.client = client ?? new AdsbClient({ sources: config.sources });
    this.tracker = new Tracker({
      airport: config.airport,
      home: config.home,
      store: {
        onEvent: (e) => this.store.recordEvent(e),
        onSighting: (s) => this.store.recordSighting(s),
      },
    });
    this.status = {
      running: false,
      lastPollAt: null,
      lastSuccessAt: null,
      lastError: null,
      source: null,
      sourceLabel: null,
      aircraftCount: 0,
      polls: 0,
      failures: 0,
    };
    this.detailCache = new Map();
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.status.running = true;
    const tick = () => {
      this.poll().catch(() => {});
    };
    tick();
    this.timer = setInterval(tick, Math.max(5, this.config.pollSeconds) * 1000);
    this.timer.unref?.();

    // Housekeeping once an hour.
    this.pruneTimer = setInterval(
      () => this.store.pruneSightings(this.config.retainSightingDays),
      3600 * 1000,
    );
    this.pruneTimer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.pruneTimer);
    this.timer = null;
    this.status.running = false;
    this.tracker.flush();
  }

  async poll(now = Date.now()) {
    this.status.lastPollAt = now;
    this.status.polls += 1;
    try {
      const { aircraft, source, sourceLabel } = await this.client.aircraftNear(
        this.config.airport.lat,
        this.config.airport.lon,
        this.config.radiusNm,
      );
      for (const ac of aircraft) this.store.recordAircraft(ac, now);
      this.tracker.ingest(aircraft, now);
      this.tracker.reap(now);
      Object.assign(this.status, {
        lastSuccessAt: now,
        lastError: null,
        source,
        sourceLabel,
        aircraftCount: aircraft.length,
      });
      return aircraft;
    } catch (err) {
      this.status.failures += 1;
      this.status.lastError = err.message;
      // Aircraft still go stale while the feed is down, so the map does not
      // freeze with hours-old positions on it.
      this.tracker.reap(now);
      throw err;
    }
  }

  /** Registry details for an aircraft, memoised so polls stay cheap. */
  detailsFor(hex, reg) {
    const cached = this.detailCache.get(hex);
    if (cached && Date.now() - cached.at < DETAIL_CACHE_MS) return cached.value;
    const value = this.store.details(hex, reg);
    this.detailCache.set(hex, { at: Date.now(), value });
    return value;
  }

  /** Everything the map needs: positions, owners, and where to look in the sky. */
  liveSnapshot(now = Date.now()) {
    const { home, airport } = this.config;
    const aircraft = this.tracker
      .live()
      .filter(Boolean)
      .map((ac) => {
        const details = this.detailsFor(ac.hex, ac.reg);
        const distHome = ac.distanceFromHomeNm ?? distanceNm(home.lat, home.lon, ac.lat, ac.lon);
        const brg = bearing(home.lat, home.lon, ac.lat, ac.lon);
        const elev = ac.altBaroFt === null ? null : elevationAngle(distHome, ac.altBaroFt, home.elevationFt);
        const registry = details.registry;
        return {
          hex: ac.hex,
          registration: details.registration ?? ac.reg,
          callsign: ac.flight,
          typeCode: ac.typeCode ?? details.feed?.typeCode ?? null,
          manufacturer: registry?.manufacturer ?? null,
          model: registry?.model ?? null,
          aircraft:
            [registry?.manufacturer, registry?.model].filter(Boolean).join(' ') ||
            ac.desc ||
            details.feed?.description ||
            null,
          owner: registry?.owner ?? ac.ownOp ?? null,
          ownerCity: registry?.ownerCity ?? null,
          ownerState: registry?.ownerState ?? null,
          ownerLocation: registry?.ownerLocation ?? null,
          ownerType: registry?.ownerType ?? null,
          yearManufactured: registry?.yearManufactured ?? ac.year ?? null,
          seats: registry?.seats ?? null,
          engineType: registry?.engineType ?? null,
          military: ac.military,
          lat: ac.lat,
          lon: ac.lon,
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
          // Overhead traffic is not "at the airport" just because it is above it.
          atAirport:
            (ac.distAirportNm ?? 99) <= 1.5 &&
            (ac.onGround || (ac.aglFt !== null && ac.aglFt < 1500)),
          ageSeconds: Math.round((now - (ac.updatedAt ?? now)) / 1000),
          visits: details.seenBefore?.visits ?? null,
        };
      })
      .sort((a, b) => a.distanceFromHomeNm - b.distanceFromHomeNm);

    return { aircraft, status: this.status, generatedAt: now };
  }
}

const round = (v, places) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(places));
