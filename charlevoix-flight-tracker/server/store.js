// Everything that touches the database lives here, so the tracker and the HTTP
// layer stay free of SQL.

import { lookupByHex, lookupByRegistration } from './faa.js';
import { hexToNNumber } from './nnumber.js';

export class Store {
  constructor(db) {
    this.db = db;
    this.stmts = {
      upsertAircraft: db.prepare(`
        INSERT INTO aircraft (hex, reg, type_code, description, own_op, year, military, first_seen, last_seen, times_seen)
        VALUES (@hex, @reg, @type_code, @description, @own_op, @year, @military, @ts, @ts, 1)
        ON CONFLICT(hex) DO UPDATE SET
          reg = COALESCE(excluded.reg, aircraft.reg),
          type_code = COALESCE(excluded.type_code, aircraft.type_code),
          description = COALESCE(excluded.description, aircraft.description),
          own_op = COALESCE(excluded.own_op, aircraft.own_op),
          year = COALESCE(excluded.year, aircraft.year),
          military = MAX(excluded.military, aircraft.military),
          last_seen = excluded.last_seen`),
      bumpSeen: db.prepare('UPDATE aircraft SET times_seen = times_seen + 1 WHERE hex = ?'),
      insertEvent: db.prepare(`
        INSERT OR IGNORE INTO events
          (hex, reg, kind, airport, ts, confidence, peak_alt_ft, min_alt_ft, closest_home_nm, closest_home_ts, track_json)
        VALUES (@hex, @reg, @kind, @airport, @ts, @confidence, @peakAltFt, @minAltFt, @closestHomeNm, @closestHomeTs, @track)`),
      insertSighting: db.prepare(`
        INSERT OR IGNORE INTO sightings
          (hex, reg, started_at, ended_at, closest_home_nm, closest_home_ts, min_alt_ft, max_alt_ft, max_speed_kt)
        VALUES (@hex, @reg, @startedAt, @endedAt, @closestHomeNm, @closestHomeTs, @minAltFt, @maxAltFt, @maxSpeedKt)`),
      getAircraft: db.prepare('SELECT * FROM aircraft WHERE hex = ?'),
    };
  }

  recordAircraft(ac, ts = Date.now()) {
    const existing = this.stmts.getAircraft.get(ac.hex);
    this.stmts.upsertAircraft.run({
      hex: ac.hex,
      reg: ac.reg ?? hexToNNumber(ac.hex),
      type_code: ac.typeCode ?? null,
      description: ac.desc ?? null,
      own_op: ac.ownOp ?? null,
      year: ac.year ?? null,
      military: ac.military ? 1 : 0,
      ts,
    });
    // "Times seen" counts separate visits, not position reports.
    if (existing && ts - existing.last_seen > 30 * 60 * 1000) this.stmts.bumpSeen.run(ac.hex);
  }

  recordEvent(event) {
    this.stmts.insertEvent.run({
      ...event,
      reg: event.reg ?? hexToNNumber(event.hex),
      track: event.track ? JSON.stringify(event.track) : null,
    });
  }

  recordSighting(sighting) {
    this.stmts.insertSighting.run({
      ...sighting,
      reg: sighting.reg ?? hexToNNumber(sighting.hex),
    });
  }

  /** Registry + previously-seen details for one aircraft. */
  details(hex, reg = null) {
    const known = this.stmts.getAircraft.get(hex) ?? null;
    const tail = reg ?? known?.reg ?? hexToNNumber(hex);
    const registry = lookupByHex(this.db, hex) ?? (tail ? lookupByRegistration(this.db, tail) : null);
    return {
      hex,
      registration: tail,
      isUsRegistered: Boolean(hexToNNumber(hex)),
      seenBefore: known
        ? { firstSeen: known.first_seen, lastSeen: known.last_seen, visits: known.times_seen }
        : null,
      feed: known
        ? { typeCode: known.type_code, description: known.description, operator: known.own_op, year: known.year, military: Boolean(known.military) }
        : null,
      registry,
    };
  }

  /**
   * Flight events, newest first.
   * @param {{kind?: string, since?: number, until?: number, hex?: string, q?: string, limit?: number, offset?: number}} opts
   */
  events(opts = {}) {
    const { kind, since, until, hex, q, limit = 100, offset = 0 } = opts;
    const where = [];
    const params = {};
    if (kind && kind !== 'all') {
      if (kind === 'airport') where.push("e.kind IN ('departure','arrival')");
      else {
        where.push('e.kind = @kind');
        params.kind = kind;
      }
    }
    if (since) { where.push('e.ts >= @since'); params.since = since; }
    if (until) { where.push('e.ts < @until'); params.until = until; }
    if (hex) { where.push('e.hex = @hex'); params.hex = hex.toLowerCase(); }
    if (q) {
      where.push(
        "(UPPER(COALESCE(e.reg, a.reg, '')) LIKE @q"
        + " OR UPPER(COALESCE(r.owner_name, '')) LIKE @q"
        + " OR UPPER(COALESCE(a.type_code, '')) LIKE @q)",
      );
      params.q = `%${String(q).toUpperCase()}%`;
    }
    const rows = this.db
      .prepare(`
        SELECT e.*, a.type_code, a.description, a.own_op, a.military,
               r.owner_name, r.city, r.state, r.type_registrant, r.year_mfr,
               m.manufacturer, m.model
        FROM events e
        LEFT JOIN aircraft a ON a.hex = e.hex
        LEFT JOIN registry r ON r.n_number = COALESCE(e.reg, a.reg)
        LEFT JOIN registry_models m ON m.code = r.mfr_mdl_code
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY e.ts DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: Math.min(limit, 500), offset });
    return rows.map(shapeEvent);
  }

  eventCount(opts = {}) {
    const { since } = opts;
    const rows = since
      ? this.db.prepare('SELECT kind, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY kind').all(since)
      : this.db.prepare('SELECT kind, COUNT(*) AS n FROM events GROUP BY kind').all();
    return rows.reduce((acc, r) => ({ ...acc, [r.kind]: r.n }), { departure: 0, arrival: 0, overflight: 0 });
  }

  /** Aircraft seen most often, for a "regulars" list. */
  frequentVisitors(limit = 20, since = 0) {
    return this.db
      .prepare(`
        SELECT e.hex, COALESCE(e.reg, a.reg) AS reg, COUNT(*) AS movements, MAX(e.ts) AS last_ts,
               a.type_code, r.owner_name, r.city, r.state, m.manufacturer, m.model
        FROM events e
        LEFT JOIN aircraft a ON a.hex = e.hex
        LEFT JOIN registry r ON r.n_number = COALESCE(e.reg, a.reg)
        LEFT JOIN registry_models m ON m.code = r.mfr_mdl_code
        WHERE e.kind IN ('departure','arrival') AND e.ts >= @since
        GROUP BY e.hex
        ORDER BY movements DESC, last_ts DESC
        LIMIT @limit`)
      .all({ limit, since })
      .map((r) => ({
        hex: r.hex,
        registration: r.reg,
        movements: r.movements,
        lastSeen: r.last_ts,
        typeCode: r.type_code,
        manufacturer: r.manufacturer || null,
        model: r.model || null,
        aircraft: [r.manufacturer, r.model].filter(Boolean).join(' ') || null,
        owner: r.owner_name || null,
        ownerCity: r.city || null,
        ownerState: r.state || null,
        ownerLocation: [r.city, r.state].filter(Boolean).join(', ') || null,
      }));
  }

  /** Movement counts per local day, for the activity chart. */
  dailyCounts(days = 14, tz = 'America/Detroit') {
    const since = Date.now() - days * 86400000;
    const rows = this.db
      .prepare("SELECT ts, kind FROM events WHERE ts >= ? AND kind IN ('departure','arrival')")
      .all(since);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const buckets = new Map();
    for (const r of rows) {
      const day = fmt.format(new Date(r.ts));
      const b = buckets.get(day) ?? { day, departures: 0, arrivals: 0 };
      if (r.kind === 'departure') b.departures += 1; else b.arrivals += 1;
      buckets.set(day, b);
    }
    return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  trackFor(eventId) {
    const row = this.db.prepare('SELECT track_json FROM events WHERE id = ?').get(eventId);
    if (!row?.track_json) return null;
    try {
      return JSON.parse(row.track_json);
    } catch {
      return null;
    }
  }

  /** Drop detailed sightings past the retention window; events are kept. */
  pruneSightings(retainDays) {
    if (!retainDays || retainDays <= 0) return 0;
    const cutoff = Date.now() - retainDays * 86400000;
    return this.db.prepare('DELETE FROM sightings WHERE ended_at < ?').run(cutoff).changes;
  }

  stats() {
    const one = (sql) => this.db.prepare(sql).get();
    return {
      aircraftKnown: one('SELECT COUNT(*) n FROM aircraft').n,
      events: one('SELECT COUNT(*) n FROM events').n,
      sightings: one('SELECT COUNT(*) n FROM sightings').n,
      registryRows: one('SELECT COUNT(*) n FROM registry').n,
      firstEvent: one('SELECT MIN(ts) t FROM events').t,
    };
  }
}

function shapeEvent(r) {
  return {
    id: r.id,
    hex: r.hex,
    registration: r.reg,
    kind: r.kind,
    airport: r.airport,
    ts: r.ts,
    confidence: r.confidence,
    peakAltFt: r.peak_alt_ft,
    minAltFt: r.min_alt_ft,
    closestHomeNm: r.closest_home_nm,
    closestHomeTs: r.closest_home_ts,
    typeCode: r.type_code,
    description: r.description,
    operator: r.own_op,
    military: Boolean(r.military),
    manufacturer: r.manufacturer || null,
    model: r.model || null,
    aircraft: [r.manufacturer, r.model].filter(Boolean).join(' ') || r.description || null,
    yearManufactured: r.year_mfr || null,
    owner: r.owner_name || null,
    ownerCity: r.city || null,
    ownerState: r.state || null,
    ownerLocation: [r.city, r.state].filter(Boolean).join(', ') || null,
  };
}
