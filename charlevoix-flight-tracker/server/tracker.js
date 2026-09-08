// Works out what the aircraft in the feed are actually doing.
//
// The feeds give us positions, not flight plans. A small field like Charlevoix
// has no tower and no published schedule, so takeoffs and landings have to be
// inferred from how each aircraft moves. Ground reports are the reliable
// signal, but a lot of light aircraft drop off the receivers as soon as they
// get low, so we also recognise the shape of a departure or an approach and
// mark those "likely" rather than "confirmed".

import { distanceNm, bearing } from './geo.js';
import { GROUND_SPEED_KT } from './adsb.js';

export const RULES = {
  // Within this distance of the field, an aircraft is "at the airport".
  atFieldNm: 1.5,
  // Departures and approaches are recognised out to here.
  nearFieldNm: 6,
  // Height above the runway that counts as airborne.
  airborneAglFt: 400,
  // A track that starts this low and this close, climbing, is a departure.
  likelyDepartureAglFt: 2200,
  likelyDepartureNm: 3.5,
  // A track that ends this low and this close, descending, is a landing.
  likelyArrivalAglFt: 900,
  likelyArrivalNm: 3,
  climbFpm: 250,
  descentFpm: -250,
  // Passing within this distance of the house is worth logging on its own.
  overflightHomeNm: 12,
  // Drop an aircraft from the live view after this long with no new position.
  staleSeconds: 120,
  // Ignore a repeat of the SAME kind within this window -- that is a jittery
  // ground/air signal, not a second takeoff. A landing followed by a takeoff is
  // a real quick turnaround and is always recorded.
  minEventGapSeconds: 60,
  // Points kept in a saved flight path.
  maxTrackPoints: 240,
};

const clampInt = (v) => (v === null || v === undefined ? null : Math.round(v));

export class Tracker {
  /**
   * @param {object} opts
   * @param {object} opts.airport {lat, lon, elevationFt, icao}
   * @param {object} opts.home    {lat, lon, elevationFt}
   * @param {object} [opts.store] persistence hooks: {onEvent, onSighting}
   * @param {object} [opts.rules] overrides for RULES
   */
  constructor({ airport, home, store = {}, rules = {} }) {
    this.airport = airport;
    this.home = home;
    this.store = store;
    this.rules = { ...RULES, ...rules };
    /** @type {Map<string, object>} live per-aircraft state, keyed by ICAO hex */
    this.tracks = new Map();
  }

  /** Everything currently being tracked, enriched for display. */
  live() {
    return [...this.tracks.values()].map((t) => t.latest);
  }

  getTrack(hex) {
    return this.tracks.get(hex) ?? null;
  }

  /**
   * Feed in one poll's worth of aircraft.
   * @returns {{events: object[], sightings: object[]}} anything newly decided
   */
  ingest(aircraftList, now = Date.now()) {
    const events = [];
    for (const ac of aircraftList) {
      const decided = this.#update(ac, now);
      events.push(...decided);
    }
    return { events, sightings: [] };
  }

  /**
   * Close out aircraft that have gone quiet. Call after each ingest.
   * @returns {{events: object[], sightings: object[]}}
   */
  reap(now = Date.now()) {
    const events = [];
    const sightings = [];
    for (const [hex, track] of this.tracks) {
      if (now - track.lastSeen <= this.rules.staleSeconds * 1000) continue;
      events.push(...this.#closeTrack(track));
      sightings.push(this.#toSighting(track));
      this.tracks.delete(hex);
    }
    for (const e of events) this.store.onEvent?.(e);
    for (const s of sightings) this.store.onSighting?.(s);
    return { events, sightings };
  }

  /** Force-close every open track, e.g. on shutdown. */
  flush(now = Date.now()) {
    const stale = this.rules.staleSeconds;
    this.rules.staleSeconds = -1;
    const result = this.reap(now);
    this.rules.staleSeconds = stale;
    return result;
  }

  #update(ac, now) {
    const distAirportNm = distanceNm(this.airport.lat, this.airport.lon, ac.lat, ac.lon);
    const distHomeNm = distanceNm(this.home.lat, this.home.lon, ac.lat, ac.lon);
    const aglFt = ac.altBaroFt === null ? null : ac.altBaroFt - this.airport.elevationFt;

    // "On the ground" is either explicitly reported, or a very low, very slow
    // aircraft sitting at the field.
    const onGround =
      ac.onGround ||
      (aglFt !== null &&
        aglFt < 150 &&
        (ac.groundSpeedKt ?? 0) < GROUND_SPEED_KT &&
        distAirportNm <= this.rules.atFieldNm);

    const sample = {
      ts: now,
      lat: ac.lat,
      lon: ac.lon,
      altFt: ac.altBaroFt,
      aglFt,
      onGround,
      gs: ac.groundSpeedKt,
      vs: ac.verticalRateFpm,
      distAirportNm,
      distHomeNm,
    };

    let track = this.tracks.get(ac.hex);
    if (!track) {
      track = {
        hex: ac.hex,
        reg: ac.reg,
        firstSeen: now,
        lastSeen: now,
        samples: [],
        phase: 'unknown',
        phaseSince: now,
        lastEventTsByKind: { departure: 0, arrival: 0, overflight: 0 },
        eventCount: 0,
        closestHomeNm: Infinity,
        closestHomeTs: now,
        minAltFt: null,
        maxAltFt: null,
        maxSpeedKt: 0,
        minDistAirportNm: Infinity,
      };
      this.tracks.set(ac.hex, track);
    }

    track.reg = ac.reg ?? track.reg;
    track.lastSeen = now;
    track.latest = { ...ac, distAirportNm, distHomeNm, aglFt, onGround, updatedAt: now,
      bearingFromHome: bearing(this.home.lat, this.home.lon, ac.lat, ac.lon) };
    track.samples.push(sample);
    if (track.samples.length > this.rules.maxTrackPoints) {
      // Thin the middle of the track rather than losing the start of it.
      track.samples = track.samples.filter((_, i) => i % 2 === 0 || i >= track.samples.length - 60);
    }

    if (distHomeNm < track.closestHomeNm) {
      track.closestHomeNm = distHomeNm;
      track.closestHomeTs = now;
    }
    if (distAirportNm < track.minDistAirportNm) track.minDistAirportNm = distAirportNm;
    if (ac.altBaroFt !== null) {
      track.minAltFt = track.minAltFt === null ? ac.altBaroFt : Math.min(track.minAltFt, ac.altBaroFt);
      track.maxAltFt = track.maxAltFt === null ? ac.altBaroFt : Math.max(track.maxAltFt, ac.altBaroFt);
    }
    if ((ac.groundSpeedKt ?? 0) > track.maxSpeedKt) track.maxSpeedKt = Math.round(ac.groundSpeedKt);

    return this.#applyPhase(track, sample);
  }

  /** Ground <-> air transitions near the field are takeoffs and landings. */
  #applyPhase(track, sample) {
    const { atFieldNm, nearFieldNm, airborneAglFt, minEventGapSeconds } = this.rules;
    const nearField = sample.distAirportNm <= nearFieldNm;
    const events = [];

    let next = track.phase;
    if (sample.onGround && sample.distAirportNm <= atFieldNm) {
      next = 'ground';
    } else if (sample.aglFt !== null && sample.aglFt >= airborneAglFt) {
      next = 'air';
    } else if (!sample.onGround && sample.aglFt === null && (sample.gs ?? 0) > GROUND_SPEED_KT) {
      next = 'air';
    }

    if (next !== track.phase) {
      const spacedOut = (kind) =>
        sample.ts - track.lastEventTsByKind[kind] >= minEventGapSeconds * 1000;
      if (track.phase === 'ground' && next === 'air' && nearField && spacedOut('departure')) {
        events.push(this.#makeEvent(track, 'departure', sample.ts, 'confirmed'));
      } else if (track.phase === 'air' && next === 'ground' && spacedOut('arrival')) {
        events.push(this.#makeEvent(track, 'arrival', sample.ts, 'confirmed'));
      }
      track.phase = next;
      track.phaseSince = sample.ts;
    }

    for (const e of events) this.store.onEvent?.(e);
    return events;
  }

  /**
   * When a track ends we get one more chance to classify it: aircraft that
   * vanish low over the runway have almost certainly landed, and tracks that
   * appear low over the runway climbing have almost certainly just left.
   */
  #closeTrack(track) {
    const events = [];
    if (track.eventCount === 0) {
      const first = track.samples[0];
      const last = track.samples[track.samples.length - 1];
      const r = this.rules;

      const climbing = this.#trend(track.samples.slice(0, 4)) > r.climbFpm;
      if (
        first &&
        first.distAirportNm <= r.likelyDepartureNm &&
        first.aglFt !== null &&
        first.aglFt <= r.likelyDepartureAglFt &&
        climbing &&
        last.distAirportNm > first.distAirportNm
      ) {
        events.push(this.#makeEvent(track, 'departure', first.ts, 'likely'));
      }

      const descending = this.#trend(track.samples.slice(-4)) < r.descentFpm;
      if (
        last &&
        last.distAirportNm <= r.likelyArrivalNm &&
        last.aglFt !== null &&
        last.aglFt <= r.likelyArrivalAglFt &&
        descending
      ) {
        events.push(this.#makeEvent(track, 'arrival', last.ts, 'likely'));
      }
    }

    if (
      events.length === 0 &&
      track.eventCount === 0 &&
      track.closestHomeNm <= this.rules.overflightHomeNm
    ) {
      events.push(this.#makeEvent(track, 'overflight', track.closestHomeTs, 'confirmed'));
    }
    return events;
  }

  /** Feet per minute of climb across a run of samples. */
  #trend(samples) {
    const usable = samples.filter((s) => s.altFt !== null);
    if (usable.length < 2) {
      const vs = samples.map((s) => s.vs).filter((v) => v !== null && v !== undefined);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    }
    const first = usable[0];
    const last = usable[usable.length - 1];
    const minutes = (last.ts - first.ts) / 60000;
    if (minutes <= 0) return 0;
    return (last.altFt - first.altFt) / minutes;
  }

  #makeEvent(track, kind, ts, confidence) {
    track.lastEventTsByKind[kind] = ts;
    track.eventCount += 1;
    return {
      hex: track.hex,
      reg: track.reg,
      kind,
      airport: kind === 'overflight' ? null : this.airport.icao,
      ts,
      confidence,
      peakAltFt: clampInt(track.maxAltFt),
      minAltFt: clampInt(track.minAltFt),
      closestHomeNm: Number.isFinite(track.closestHomeNm) ? Number(track.closestHomeNm.toFixed(2)) : null,
      closestHomeTs: track.closestHomeTs,
      track: track.samples.map((s) => [s.ts, Number(s.lat.toFixed(5)), Number(s.lon.toFixed(5)), s.altFt]),
    };
  }

  #toSighting(track) {
    return {
      hex: track.hex,
      reg: track.reg,
      startedAt: track.firstSeen,
      endedAt: track.lastSeen,
      closestHomeNm: Number.isFinite(track.closestHomeNm) ? Number(track.closestHomeNm.toFixed(2)) : null,
      closestHomeTs: track.closestHomeTs,
      minAltFt: clampInt(track.minAltFt),
      maxAltFt: clampInt(track.maxAltFt),
      maxSpeedKt: track.maxSpeedKt || null,
    };
  }
}
